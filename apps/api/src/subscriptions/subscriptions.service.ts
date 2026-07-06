import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { PlansService } from '../plans/plans.service';
import { WalletService } from '../wallet/wallet.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';

const GRACE_PERIOD_HOURS = 24;
const DELETION_SCHEDULE_HOURS = 72;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subsRepo: SubscriptionsRepository,
    private readonly plansService: PlansService,
    private readonly walletService: WalletService,
    private readonly poolService: ResourcePoolService,
    private readonly jobService: ProxmoxJobService,
  ) {}

  async subscribe(
    userId: string,
    dto: { planId: string; couponCode?: string; poolId?: string; name?: string; customMemoryMb?: number; customCpuCores?: number; customDiskGb?: number },
  ) {
    const plan = await this.plansService.getPlan(dto.planId);
    if (!plan.isActive) throw new BadRequestException('Plan is not active');

    const activeSubs = await this.subsRepo.findActiveSubscriptionsByUser(userId);
    if (plan.maxSubscriptions && activeSubs.length >= plan.maxSubscriptions) {
      throw new BadRequestException(`Maximum subscriptions (${plan.maxSubscriptions}) reached for this plan`);
    }

    let effectivePrice = plan.priceCredits;
    let couponRecord: any = null;
    let couponScope: string | undefined;

    if (dto.couponCode) {
      const validation = await this.plansService.validateCoupon(dto.planId, dto.couponCode);
      couponScope = validation.couponScope;
      if (validation.couponScope === 'initial' || validation.couponScope === 'both') {
        if (validation.discountPercent) {
          effectivePrice = Math.round(effectivePrice * (1 - validation.discountPercent / 100));
        }
        if (validation.discountCredits) {
          effectivePrice = Math.max(0, effectivePrice - validation.discountCredits);
        }
      }
      couponRecord = validation;
    }

    const vmName = dto.name || `${plan.name}-${userId.slice(0, 8)}`;

    const resources = {
      cpuCores: dto.customCpuCores ?? plan.cpuCores,
      memoryMb: dto.customMemoryMb ?? plan.memoryMb,
      diskGb: dto.customDiskGb ?? plan.diskGb,
    };

    return this.prisma.$transaction(async (tx: any) => {
      try {
        await this.walletService.debit(userId, effectivePrice, `subscription:${plan.id}`, {
          planName: plan.name,
          periodDays: plan.billingPeriodDays,
        });
      } catch (error) {
        throw new BadRequestException(
          `Insufficient balance: need ${effectivePrice} cents for first billing period. ${(error as Error).message}`,
        );
      }

      const defaultNode = await this.subsRepo.findFirstActiveNode();
      if (!defaultNode) throw new BadRequestException('No active node available');

      const vm = await this.subsRepo.createVm({
        userId,
        name: vmName,
        status: 'provisioning',
        proxmoxId: null,
        nodeId: defaultNode.id,
        cpuCores: resources.cpuCores,
        memoryMb: resources.memoryMb,
        diskGb: resources.diskGb,
        templateId: plan.templateId,
      }, tx);

      let pool = dto.poolId
        ? await this.subsRepo.findPoolByUser(userId, tx)
        : null;

      if (!pool) {
        const userPools = await this.poolService.getUserPools(userId);
        if (userPools.length > 0) {
          pool = userPools[0];
        } else {
          pool = await this.poolService.createPool({
            userId,
            totalCores: resources.cpuCores,
            totalMemoryMb: resources.memoryMb,
            totalDiskGb: resources.diskGb,
          });
        }
      }

      if (pool) {
        const poolRows = await this.subsRepo.lockPoolById(pool.id, tx);
        const lockedPool = poolRows[0];
        if (lockedPool) {
          const usage = await this.subsRepo.sumAllocationsByPool(pool.id, tx);
          const used = usage[0];
          const availCores = Number(lockedPool.totalCores) - Number(used.cores);
          const availMem = Number(lockedPool.totalMemoryMb) - Number(used.memoryMb);
          const availDisk = Number(lockedPool.totalDiskGb) - Number(used.diskGb);
          if (resources.cpuCores > availCores || resources.memoryMb > availMem || resources.diskGb > availDisk) {
            throw new ForbiddenException('Insufficient resources in pool');
          }

          await this.subsRepo.createAllocation({
            poolId: pool.id,
            vmId: vm.id,
            cores: resources.cpuCores,
            memoryMb: resources.memoryMb,
            diskGb: resources.diskGb,
          }, tx);
        }
      }

      const availableIp = await this.subsRepo.findAvailableIp(tx);
      if (availableIp) {
        await tx.ipAddress.update({
          where: { id: availableIp.id },
          data: { isAssigned: true, vmId: vm.id },
        });
      }

      const nextRenewal = new Date();
      nextRenewal.setDate(nextRenewal.getDate() + plan.billingPeriodDays);

      const nextRenewalDiscountPct = couponRecord && (couponScope === 'renewal' || couponScope === 'both')
        ? couponRecord.discountPercent ?? null
        : null;
      const nextRenewalDiscountCredits = couponRecord && (couponScope === 'renewal' || couponScope === 'both')
        ? couponRecord.discountCredits ?? null
        : null;

      const sub = await this.subsRepo.createSubscription({
        userId,
        planId: dto.planId,
        status: 'active',
        vmId: vm.id,
        cpuCores: resources.cpuCores,
        memoryMb: resources.memoryMb,
        diskGb: resources.diskGb,
        backupLimit: plan.backupLimit,
        snapshotLimit: plan.snapshotLimit,
        nextRenewalAt: nextRenewal,
        couponId: couponRecord?.couponId ?? null,
        couponCode: dto.couponCode ?? null,
        couponScope: couponScope ?? null,
        renewalDiscountPercent: nextRenewalDiscountPct,
        renewalDiscountCredits: nextRenewalDiscountCredits,
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'subscription.create',
          resource: 'subscription',
          resourceId: sub.id,
          metadata: {
            planId: dto.planId,
            planName: plan.name,
            priceCredits: effectivePrice,
            couponCode: dto.couponCode,
            resources,
          },
        },
      });

      this.logger.log(`Subscription ${sub.id} created for user ${userId}, plan ${plan.name}`);

      return sub;
    });
  }

  async getUserSubscriptions(userId: string) {
    return this.subsRepo.findSubscriptionsByUser(userId);
  }

  async getSubscription(id: string, userId: string) {
    const sub = await this.subsRepo.findSubscriptionById(id, {
      plan: { include: { category: true } },
      vm: true,
      coupon: true,
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');
    return sub;
  }

  async cancelSubscription(id: string, userId: string, reason?: string) {
    const sub = await this.subsRepo.findSubscriptionById(id, { plan: true });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');

    if (sub.status === 'cancelled' || sub.status === 'expired') {
      throw new BadRequestException(`Subscription is already ${sub.status}`);
    }

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.subsRepo.updateSubscription(id, {
        status: 'cancelled',
        cancelledAt: new Date(),
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'subscription.cancel',
          resource: 'subscription',
          resourceId: id,
          metadata: { planName: sub.plan?.name, reason },
        },
      });

      return updated;
    });
  }

  async adminCancelSubscription(id: string, adminUserId: string) {
    const sub = await this.subsRepo.findSubscriptionById(id);
    if (!sub) throw new NotFoundException('Subscription not found');

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.subsRepo.updateSubscription(id, {
        status: 'cancelled',
        cancelledAt: new Date(),
      }, tx);

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'subscription.admin-cancel',
          resource: 'subscription',
          resourceId: id,
          metadata: { targetUserId: sub.userId },
        },
      });

      return updated;
    });
  }

  async changePlan(id: string, userId: string, newPlanId: string, options?: { couponCode?: string; confirmDowngrade?: boolean }) {
    const sub = await this.subsRepo.findSubscriptionById(id, { plan: true, vm: true });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');

    if (sub.status !== 'active') {
      throw new BadRequestException(`Cannot change plan for subscription in ${sub.status} status`);
    }

    const newPlan = await this.plansService.getPlan(newPlanId);
    if (!newPlan.isActive) throw new BadRequestException('Target plan is not active');

    const allowedUpgrade: string[] = (sub.plan as any)?.allowedUpgradePlanIds ?? [];
    const allowedDowngrade: string[] = (sub.plan as any)?.allowedDowngradePlanIds ?? [];

    const isUpgrade = newPlan.priceCredits > (sub.plan as any)?.priceCredits;
    const isDowngrade = newPlan.priceCredits < (sub.plan as any)?.priceCredits;

    if (isUpgrade && !allowedUpgrade.includes(newPlanId)) {
      throw new BadRequestException('This plan does not allow upgrade to the specified plan');
    }
    if (isDowngrade && !allowedDowngrade.includes(newPlanId)) {
      throw new BadRequestException('This plan does not allow downgrade to the specified plan');
    }

    if (newPlan.diskGb < sub.diskGb && !options?.confirmDowngrade) {
      throw new BadRequestException(
        'Disk shrink requires confirmation. Set confirmDowngrade=true to acknowledge potential downtime.',
      );
    }

    const priceDiff = newPlan.priceCredits - (sub.plan as any)?.priceCredits;

    if (priceDiff > 0) {
      try {
        await this.walletService.debit(userId, priceDiff, `subscription:${id}:upgrade`, {
          oldPlan: (sub.plan as any)?.name,
          newPlan: newPlan.name,
        });
      } catch {
        throw new BadRequestException(`Insufficient balance for upgrade: need ${priceDiff} more credits`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const u = await this.subsRepo.updateSubscription(id, {
        planId: newPlanId,
        cpuCores: newPlan.cpuCores,
        memoryMb: newPlan.memoryMb,
        diskGb: newPlan.diskGb,
        backupLimit: newPlan.backupLimit,
        snapshotLimit: newPlan.snapshotLimit,
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'subscription.change-plan',
          resource: 'subscription',
          resourceId: id,
          metadata: { oldPlanId: sub.planId, newPlanId, priceDiff, diskShrink: newPlan.diskGb < sub.diskGb },
        },
      });

      return u;
    });

    if (sub.vm?.proxmoxId) {
      await this.jobService.enqueueJob('resize-vm', {
        vmId: sub.vm.id,
        proxmoxId: sub.vm.proxmoxId,
        node: sub.vm.nodeId,
        cores: newPlan.cpuCores,
        memory: newPlan.memoryMb,
        disk: newPlan.diskGb,
      }, {
        userId,
        auditLog: { action: 'vm.resize.plan-change', resource: 'vm', resourceId: sub.vm.id },
      });
    }

    return updated;
  }

  async renewSubscription(subId: string) {
    const sub = await this.subsRepo.findSubscriptionById(subId, {
      plan: true,
      user: true,
      coupon: true,
    });
    if (!sub || sub.status !== 'active') return null;

    if (sub.nextRenewalAt && sub.nextRenewalAt > new Date()) return null;

    const plan = sub.plan as any;
    let renewalPrice = plan.priceCredits;

    if (sub.renewalDiscountPercent) {
      renewalPrice = Math.round(renewalPrice * (1 - sub.renewalDiscountPercent / 100));
    }
    if (sub.renewalDiscountCredits) {
      renewalPrice = Math.max(0, renewalPrice - sub.renewalDiscountCredits);
    }

    try {
      await this.walletService.debit(sub.userId, renewalPrice, `subscription:${sub.id}:renewal`, {
        planName: plan.name,
        periodDays: plan.billingPeriodDays,
      });
    } catch {
      this.logger.warn(`Subscription ${sub.id} renewal failed — insufficient balance, entering grace period`);

      await this.prisma.$transaction(async (tx: any) => {
        await this.subsRepo.updateSubscription(sub.id, {
          status: 'grace_period',
          graceStartedAt: new Date(),
        }, tx);

        if (sub.vmId) {
          await tx.vm.update({
            where: { id: sub.vmId },
            data: { status: 'suspended', suspendedAt: new Date() },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: sub.userId,
            action: 'subscription.grace-period',
            resource: 'subscription',
            resourceId: sub.id,
            metadata: { reason: 'renewal_failed', graceHours: GRACE_PERIOD_HOURS },
          },
        });
      });

      return { status: 'grace_period', subId: sub.id };
    }

    const nextRenewal = new Date();
    nextRenewal.setDate(nextRenewal.getDate() + plan.billingPeriodDays);

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.subsRepo.updateSubscription(sub.id, {
        nextRenewalAt: nextRenewal,
        status: 'active',
      }, tx);

      await tx.auditLog.create({
        data: {
          userId: sub.userId,
          action: 'subscription.renew',
          resource: 'subscription',
          resourceId: sub.id,
          metadata: { amount: renewalPrice, nextRenewalAt: nextRenewal },
        },
      });

      return updated;
    });
  }

  async processGracePeriods() {
    const graceSubs = await this.subsRepo.findSubscriptionsInGracePeriod();
    const results: any[] = [];

    for (const sub of graceSubs) {
      const graceStart = sub.graceStartedAt ?? sub.updatedAt;
      const hoursInGrace = (Date.now() - graceStart.getTime()) / 3600000;

      if (hoursInGrace > DELETION_SCHEDULE_HOURS) {
        const updated = await this.prisma.$transaction(async (tx: any) => {
          await this.subsRepo.updateSubscription(sub.id, { status: 'expired' }, tx);

          if (sub.vmId) {
            const vm = await this.subsRepo.findVmById(sub.vmId);
            if (vm?.proxmoxId) {
              await this.jobService.enqueueJob('delete-vm', {
                vmId: sub.vmId,
                proxmoxId: vm.proxmoxId,
                node: vm.nodeId,
              }, {
                userId: sub.userId,
                auditLog: { action: 'vm.delete.subscription-expired', resource: 'vm', resourceId: sub.vmId },
              });
            }
          }

          await tx.auditLog.create({
            data: {
              userId: sub.userId,
              action: 'subscription.expired',
              resource: 'subscription',
              resourceId: sub.id,
              metadata: { reason: 'grace_period_expired' },
            },
          });

          return sub.id;
        });

        results.push({ id: updated, action: 'expired' });
      }
    }

    return results;
  }

  async renewAllDue() {
    const dueSubs = await this.subsRepo.findSubscriptionsDueForRenewal();
    const results = [];

    for (const sub of dueSubs) {
      try {
        const result = await this.renewSubscription(sub.id);
        results.push({ id: sub.id, result });
      } catch (error) {
        this.logger.error(`Failed to renew subscription ${sub.id}: ${(error as Error).message}`);
        results.push({ id: sub.id, error: (error as Error).message });
      }
    }

    return results;
  }

  async adminListSubscriptions(query: { status?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.status) where.status = query.status;

    return this.subsRepo.findSubscriptionsPaginated(skip, limit, where);
  }

  async adminGetSubscription(id: string) {
    const sub = await this.subsRepo.findSubscriptionById(id, {
      plan: { include: { category: true } },
      user: { select: { id: true, name: true, email: true } },
      vm: true,
      coupon: true,
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  async adminRefundSubscription(id: string, amount: number, adminUserId: string) {
    const sub = await this.subsRepo.findSubscriptionById(id);
    if (!sub) throw new NotFoundException('Subscription not found');

    return this.prisma.$transaction(async (tx: any) => {
      await this.walletService.credit(sub.userId, amount, `subscription:${id}:refund`, {
        adminUserId,
      });

      const refundedTotal = (sub.adminCreditsRefundedTotal ?? 0) + amount;

      await this.subsRepo.updateSubscription(id, {
        adminCreditsRefundedTotal: refundedTotal,
        adminRefundedAt: new Date(),
      }, tx);

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'subscription.admin-refund',
          resource: 'subscription',
          resourceId: id,
          metadata: { amount, targetUserId: sub.userId, totalRefunded: refundedTotal },
        },
      });

      return { message: `Refunded ${amount} cents to user ${sub.userId}` };
    });
  }

  async countNewSince(since: Date) {
    return this.subsRepo.countSubscriptions({ createdAt: { gte: since } });
  }

  async countActive() {
    return this.subsRepo.countSubscriptions({ status: 'active' });
  }

  async countActiveByUser(userId: string) {
    return this.subsRepo.countSubscriptions({ userId, status: 'active' });
  }
}
