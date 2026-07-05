import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralsRepository } from './referrals.repository';
import { WalletService } from '../wallet/wallet.service';
import { randomBytes } from 'node:crypto';

const DEFAULT_REFERRAL_REWARD = 500; // 5.00 credits per referral

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ReferralsRepository,
    private readonly walletService: WalletService,
  ) {}

  // ─── Referral Code ───────────────────────────────────────────

  async generateCode(userId: string, customCode?: string, maxUses?: number, expiresAt?: Date) {
    const existing = await this.repo.findCodeByUser(userId);
    if (existing) throw new BadRequestException('User already has a referral code');

    const code = customCode ?? randomBytes(3).toString('hex').toUpperCase();

    const codeExists = await this.repo.findCodeByString(code);
    if (codeExists) throw new BadRequestException('Referral code already taken');

    return this.prisma.$transaction(async (tx: any) => {
      const referralCode = await this.repo.createCode({
        userId,
        code,
        maxUses,
        expiresAt,
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'referral-code.generate',
          resource: 'referralCode',
          resourceId: referralCode.id,
          metadata: { code },
        },
      });

      return referralCode;
    });
  }

  async getMyCode(userId: string) {
    const code = await this.repo.findCodeByUser(userId);
    return code ?? null;
  }

  async getCodeByString(code: string) {
    const referralCode = await this.repo.findCodeByString(code);
    if (!referralCode) throw new NotFoundException('Referral code not found');
    return referralCode;
  }

  async getAllCodes() {
    return this.repo.findAllCodesWithUsage();
  }

  // ─── Redeem Referral ─────────────────────────────────────────

  async redeemReferral(referredUserId: string, code: string) {
    const referralCode = await this.repo.findCodeByString(code);
    if (!referralCode) throw new BadRequestException('Invalid referral code');

    if (referralCode.expiresAt && new Date() > referralCode.expiresAt) {
      throw new BadRequestException('Referral code has expired');
    }

    if (referralCode.maxUses && referralCode.uses >= referralCode.maxUses) {
      throw new BadRequestException('Referral code has reached maximum uses');
    }

    if (referralCode.userId === referredUserId) {
      throw new BadRequestException('Cannot use your own referral code');
    }

    const alreadyReferred = await this.repo.findUsageByReferredUser(referredUserId);
    if (alreadyReferred) throw new BadRequestException('You have already used a referral code');

    return this.prisma.$transaction(async (tx: any) => {
      const usage = await this.repo.createUsage({
        codeId: referralCode.id,
        referredUserId,
        rewardCredits: DEFAULT_REFERRAL_REWARD,
      }, tx);

      await this.repo.updateCode(referralCode.id, { uses: { increment: 1 } }, tx);

      // Reward the referrer
      await this.walletService.credit(
        referralCode.userId,
        DEFAULT_REFERRAL_REWARD,
        `referral:${code}`,
        { referredUserId, usageId: usage.id },
      );

      // Reward the new user
      await this.walletService.credit(
        referredUserId,
        DEFAULT_REFERRAL_REWARD,
        `referral:signup:${code}`,
        { referrerUserId: referralCode.userId },
      );

      await tx.auditLog.create({
        data: {
          userId: referredUserId,
          action: 'referral.redeem',
          resource: 'referralUsage',
          resourceId: usage.id,
          metadata: {
            code,
            referrerUserId: referralCode.userId,
            rewardCredits: DEFAULT_REFERRAL_REWARD,
          },
        },
      });

      this.logger.log(`Referral redeemed: ${referredUserId} used code ${code} from ${referralCode.userId}`);

      return {
        message: 'Referral code redeemed successfully',
        rewardCredits: DEFAULT_REFERRAL_REWARD,
      };
    });
  }

  // ─── Stats ───────────────────────────────────────────────────

  async getUserReferralStats(userId: string) {
    const code = await this.repo.findCodeByUser(userId);
    if (!code) return { totalReferrals: 0, totalRewards: 0, code: null };

    const usage = await this.repo.findUsageByCode(code.id);
    const totalRewards = usage.reduce((sum: number, u: any) => sum + (u.rewardCredits ?? 0), 0);

    return {
      code: code.code,
      totalReferrals: usage.length,
      totalRewards,
      maxUses: code.maxUses,
      uses: code.uses,
      usage,
    };
  }

  async getAllReferralStats() {
    const codes = await this.repo.findAllCodesWithUsage();
    return codes.map((c: any) => ({
      id: c.id,
      code: c.code,
      user: c.user,
      uses: c.uses,
      maxUses: c.maxUses,
      usageCount: c.usage?.length || 0,
      totalRewards: (c.usage || []).reduce((sum: number, u: any) => sum + (u.rewardCredits ?? 0), 0),
      createdAt: c.createdAt,
    }));
  }
}
