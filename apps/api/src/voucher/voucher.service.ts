import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VoucherRepository } from './voucher.repository';
import { WalletService } from '../wallet/wallet.service';
import { randomBytes } from 'node:crypto';

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly voucherRepo: VoucherRepository,
    private readonly walletService: WalletService,
  ) {}

  async createVoucher(data: {
    rewardType?: string;
    amount: number;
    planId?: string;
    freePeriodDays?: number;
    discountPercent?: number;
    discountCredits?: number;
    couponScope?: string;
    maxRedemptions?: number;
    expiresAt?: Date;
    code?: string;
  }) {
    const code = data.code ?? randomBytes(4).toString('hex').toUpperCase();

    const existing = await this.voucherRepo.findByCode(code);
    if (existing) throw new BadRequestException('Voucher code already exists');

    const rewardType = data.rewardType ?? 'credits';

    if (rewardType !== 'credits' && !data.planId) {
      throw new BadRequestException('planId is required for plan_trial and plan_coupon reward types');
    }

    if (rewardType === 'plan_trial' && !data.freePeriodDays) {
      throw new BadRequestException('freePeriodDays is required for plan_trial reward type');
    }

    const voucher = await this.prisma.$transaction(async (tx: any) => {
      const v = await this.voucherRepo.create({
        code,
        amount: data.amount,
        rewardType,
        planId: data.planId ?? null,
        freePeriodDays: data.freePeriodDays ?? null,
        discountPercent: data.discountPercent ?? null,
        discountCredits: data.discountCredits ?? null,
        couponScope: data.couponScope ?? null,
        maxRedemptions: data.maxRedemptions,
        expiresAt: data.expiresAt,
      }, tx);

      await tx.auditLog.create({
        data: {
          action: 'voucher.create',
          resource: 'voucher',
          resourceId: v.id,
          metadata: { code, rewardType, amount: data.amount, planId: data.planId } as any,
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

    const rewardType = voucher.rewardType ?? 'credits';

    if (rewardType === 'plan_trial') {
      return this.redeemPlanTrial(userId, voucher);
    }

    if (rewardType === 'plan_coupon') {
      return this.redeemPlanCoupon(userId, voucher);
    }

    return this.redeemCredits(userId, voucher, code);
  }

  private async redeemCredits(userId: string, voucher: any, code: string) {
    await this.voucherRepo.update(voucher.id, { currentRedemptions: { increment: 1 } });
    await this.voucherRepo.createRedemption({ voucherId: voucher.id, userId });

    await this.walletService.credit(userId, voucher.amount, `voucher:${code}`, { voucherId: voucher.id });

    return { message: `Voucher redeemed: ${voucher.amount} cents credited`, amount: voucher.amount };
  }

  private async redeemPlanTrial(userId: string, voucher: any) {
    const plan = await this.voucherRepo.findPlanById(voucher.planId);
    if (!plan) throw new BadRequestException('Linked plan not found for trial voucher');
    if (!plan.isActive) throw new BadRequestException('Linked plan is not active');

    const trialDays = voucher.freePeriodDays ?? plan.billingPeriodDays;
    const nextRenewal = new Date();
    nextRenewal.setDate(nextRenewal.getDate() + trialDays);

    return this.prisma.$transaction(async (tx: any) => {
      await this.voucherRepo.update(voucher.id, { currentRedemptions: { increment: 1 } }, tx);
      await this.voucherRepo.createRedemption({ voucherId: voucher.id, userId }, tx);

      if (voucher.amount > 0) {
        await this.walletService.credit(userId, voucher.amount, `voucher:${voucher.code}:trial`, {
          voucherId: voucher.id,
          planId: plan.id,
          trialDays,
        });
      }

      const sub = await this.voucherRepo.createSubscription({
        userId,
        planId: plan.id,
        status: 'active',
        cpuCores: plan.cpuCores,
        memoryMb: plan.memoryMb,
        diskGb: plan.diskGb,
        backupLimit: plan.backupLimit,
        snapshotLimit: plan.snapshotLimit,
        nextRenewalAt: nextRenewal,
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'subscription.trial',
          resource: 'subscription',
          resourceId: sub.id,
          metadata: {
            voucherId: voucher.id,
            planId: plan.id,
            planName: plan.name,
            trialDays,
            nextRenewalAt: nextRenewal,
          },
        },
      });

      this.logger.log(`User ${userId} started trial subscription ${sub.id} for plan ${plan.name} (${trialDays} days)`);

      return {
        message: `Trial started: ${trialDays} days free for ${plan.name}`,
        amount: 0,
        subscriptionId: sub.id,
        trialDays,
        planName: plan.name,
        nextRenewalAt: nextRenewal,
      };
    });
  }

  private async redeemPlanCoupon(userId: string, voucher: any) {
    const plan = await this.voucherRepo.findPlanById(voucher.planId);
    if (!plan) throw new BadRequestException('Linked plan not found for coupon voucher');
    if (!plan.isActive) throw new BadRequestException('Linked plan is not active');

    return this.prisma.$transaction(async (tx: any) => {
      await this.voucherRepo.update(voucher.id, { currentRedemptions: { increment: 1 } }, tx);
      await this.voucherRepo.createRedemption({ voucherId: voucher.id, userId }, tx);

      let effectivePrice = plan.priceCredits;
      let appliedDiscount = 0;

      if (voucher.discountPercent) {
        appliedDiscount = Math.round(effectivePrice * voucher.discountPercent / 100);
        effectivePrice -= appliedDiscount;
      }
      if (voucher.discountCredits) {
        const creditDiscount = Math.min(voucher.discountCredits, effectivePrice);
        appliedDiscount += creditDiscount;
        effectivePrice -= creditDiscount;
      }
      effectivePrice = Math.max(0, effectivePrice);

      if (voucher.amount > 0) {
        await this.walletService.credit(userId, voucher.amount, `voucher:${voucher.code}:coupon`, {
          voucherId: voucher.id,
          planId: plan.id,
          discountPercent: voucher.discountPercent,
          discountCredits: voucher.discountCredits,
        });
      }

      const nextRenewal = new Date();
      nextRenewal.setDate(nextRenewal.getDate() + plan.billingPeriodDays);

      const sub = await this.voucherRepo.createSubscription({
        userId,
        planId: plan.id,
        status: 'active',
        cpuCores: plan.cpuCores,
        memoryMb: plan.memoryMb,
        diskGb: plan.diskGb,
        backupLimit: plan.backupLimit,
        snapshotLimit: plan.snapshotLimit,
        nextRenewalAt: nextRenewal,
      }, tx);

      if (effectivePrice > 0) {
        try {
          await this.walletService.debit(userId, effectivePrice, `subscription:${sub.id}:initial`, {
            planName: plan.name,
            voucherCode: voucher.code,
          });
        } catch (error) {
          throw new BadRequestException(
            `Insufficient balance for subscription after coupon: need ${effectivePrice} cents. ${(error as Error).message}`,
          );
        }
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'subscription.create-with-coupon',
          resource: 'subscription',
          resourceId: sub.id,
          metadata: {
            voucherId: voucher.id,
            planId: plan.id,
            planName: plan.name,
            discountPercent: voucher.discountPercent,
            discountCredits: voucher.discountCredits,
            pricePaid: effectivePrice,
          },
        },
      });

      this.logger.log(`User ${userId} subscribed to ${plan.name} via coupon voucher, paid ${effectivePrice} cents`);

      return {
        message: `Subscribed to ${plan.name} with voucher discount`,
        amount: effectivePrice,
        subscriptionId: sub.id,
        planName: plan.name,
        pricePaid: effectivePrice,
        discountApplied: appliedDiscount,
        nextRenewalAt: nextRenewal,
      };
    });
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
