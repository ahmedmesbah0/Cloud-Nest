import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VoucherRepository } from './voucher.repository';
import { WalletService } from '../wallet/wallet.service';
import { randomBytes } from 'node:crypto';

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly voucherRepo: VoucherRepository,
    private readonly walletService: WalletService,
  ) {}

  async createVoucher(data: {
    amount: number;
    maxRedemptions?: number;
    expiresAt?: Date;
    code?: string;
  }) {
    const code = data.code ?? randomBytes(4).toString('hex').toUpperCase();

    const existing = await this.voucherRepo.findByCode(code);
    if (existing) throw new BadRequestException('Voucher code already exists');

    const voucher = await this.prisma.$transaction(async (tx: any) => {
      const v = await this.voucherRepo.create({
        code,
        amount: data.amount,
        maxRedemptions: data.maxRedemptions,
        expiresAt: data.expiresAt,
      }, tx);

      await tx.auditLog.create({
        data: {
          action: 'voucher.create',
          resource: 'voucher',
          resourceId: v.id,
          metadata: { code, amount: data.amount, maxRedemptions: data.maxRedemptions } as any,
        },
      });

      return v;
    });

    return voucher;
  }

  async listVouchers() {
    return this.voucherRepo.findMany();
  }

  async getVoucher(id: string) {
    const voucher = await this.voucherRepo.findById(id);
    if (!voucher) throw new NotFoundException('Voucher not found');
    return voucher;
  }

  async redeemVoucher(userId: string, code: string) {
    const voucher = await this.voucherRepo.findByCode(code);
    if (!voucher) throw new BadRequestException('Invalid voucher code');

    if (!voucher.isActive) throw new BadRequestException('Voucher is deactivated');

    if (voucher.expiresAt && new Date() > voucher.expiresAt) {
      throw new BadRequestException('Voucher has expired');
    }

    if (voucher.maxRedemptions && voucher.currentRedemptions >= voucher.maxRedemptions) {
      throw new BadRequestException('Voucher has reached maximum redemptions');
    }

    const alreadyRedeemed = await this.voucherRepo.findRedemption(voucher.id, userId);
    if (alreadyRedeemed) throw new BadRequestException('Voucher already redeemed by this user');

    await this.voucherRepo.update(voucher.id, { currentRedemptions: { increment: 1 } });
    await this.voucherRepo.createRedemption({ voucherId: voucher.id, userId });

    await this.walletService.credit(userId, voucher.amount, `voucher:${code}`, { voucherId: voucher.id });

    return { message: `Voucher redeemed: ${voucher.amount} cents credited`, amount: voucher.amount };
  }

  async deactivateVoucher(id: string, userId?: string) {
    const voucher = await this.getVoucher(id);

    const result = await this.prisma.$transaction(async (tx: any) => {
      const updated = await this.voucherRepo.update(id, { isActive: false }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'voucher.deactivate',
          resource: 'voucher',
          resourceId: id,
          metadata: { code: voucher.code, wasActive: voucher.isActive } as any,
        },
      });

      return updated;
    });

    return result;
  }

  async getVoucherStats() {
    const all = await this.voucherRepo.findMany();
    const totalValueRedeemed = all.reduce((s: number, v: any) => s + v.amount * v.currentRedemptions, 0);
    return {
      totalVouchers: all.length,
      totalRedemptions: all.reduce((s: number, v: any) => s + v.currentRedemptions, 0),
      totalValueRedeemed,
      activeVouchers: all.filter((v: any) => v.isActive).length,
    };
  }
}
