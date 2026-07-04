import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'node:crypto';

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createVoucher(data: {
    amount: number;
    maxRedemptions?: number;
    expiresAt?: Date;
    code?: string;
  }) {
    const code = data.code ?? randomBytes(4).toString('hex').toUpperCase();

    const existing = await this.prisma.voucherCode.findUnique({ where: { code } });
    if (existing) throw new BadRequestException('Voucher code already exists');

    const voucher = await this.prisma.voucherCode.create({
      data: {
        code,
        amount: data.amount,
        maxRedemptions: data.maxRedemptions,
        expiresAt: data.expiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'voucher.create',
        resource: 'voucher',
        resourceId: voucher.id,
        metadata: { code, amount: data.amount, maxRedemptions: data.maxRedemptions } as any,
      },
    });

    return voucher;
  }

  async listVouchers() {
    return this.prisma.voucherCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getVoucher(id: string) {
    const voucher = await this.prisma.voucherCode.findUnique({ where: { id } });
    if (!voucher) throw new NotFoundException('Voucher not found');
    return voucher;
  }

  async redeemVoucher(userId: string, code: string) {
    const voucher = await this.prisma.voucherCode.findUnique({ where: { code } });
    if (!voucher) throw new BadRequestException('Invalid voucher code');

    if (!voucher.isActive) throw new BadRequestException('Voucher is deactivated');

    if (voucher.expiresAt && new Date() > voucher.expiresAt) {
      throw new BadRequestException('Voucher has expired');
    }

    if (voucher.maxRedemptions && voucher.currentRedemptions >= voucher.maxRedemptions) {
      throw new BadRequestException('Voucher has reached maximum redemptions');
    }

    const alreadyRedeemed = await this.prisma.voucherRedemption.findFirst({
      where: { voucherId: voucher.id, userId },
    });
    if (alreadyRedeemed) throw new BadRequestException('Voucher already redeemed by this user');

    return this.prisma.$transaction(async (tx: any) => {
      await tx.voucherCode.update({
        where: { id: voucher.id },
        data: { currentRedemptions: { increment: 1 } },
      });

      await tx.voucherRedemption.create({
        data: { voucherId: voucher.id, userId },
      });

      await tx.wallet.upsert({
        where: { userId },
        create: { userId, balance: voucher.amount },
        update: { balance: { increment: voucher.amount } },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId } });

      await tx.transaction.create({
        data: {
          walletId: wallet!.id,
          amount: voucher.amount,
          type: 'credit',
          reference: `voucher:${code}`,
          metadata: { voucherId: voucher.id },
        },
      });

      return { message: `Voucher redeemed: ${voucher.amount} cents credited`, amount: voucher.amount };
    });
  }

  async deactivateVoucher(id: string, userId?: string) {
    const voucher = await this.getVoucher(id);
    const result = await this.prisma.voucherCode.update({
      where: { id },
      data: { isActive: false },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'voucher.deactivate',
        resource: 'voucher',
        resourceId: id,
        metadata: { code: voucher.code, wasActive: voucher.isActive } as any,
      },
    });

    return result;
  }

  async getVoucherStats() {
    const all = await this.prisma.voucherCode.findMany();
    const totalValueRedeemed = all.reduce((s: number, v) => s + v.amount * v.currentRedemptions, 0);
    return {
      totalVouchers: all.length,
      totalRedemptions: all.reduce((s: number, v) => s + v.currentRedemptions, 0),
      totalValueRedeemed,
      activeVouchers: all.filter((v: any) => v.isActive).length,
    };
  }
}
