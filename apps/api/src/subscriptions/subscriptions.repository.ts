import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findSubscriptionById(id: string, include?: any, tx?: PrismaTx) {
    return this.db(tx).subscription.findUnique({ where: { id }, include });
  }

  async findSubscriptionsByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).subscription.findMany({
      where: { userId },
      include: { plan: true, vm: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSubscriptionsByPlan(planId: string, tx?: PrismaTx) {
    return this.db(tx).subscription.findMany({ where: { planId } });
  }

  async findActiveSubscriptionsByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).subscription.findMany({
      where: { userId, status: { in: ['active', 'pending'] } },
      include: { plan: true },
    });
  }

  async findSubscriptionsDueForRenewal(tx?: PrismaTx) {
    return this.db(tx).subscription.findMany({
      where: {
        status: 'active',
        nextRenewalAt: { lte: new Date() },
      },
      include: { plan: true, user: true, coupon: true },
    });
  }

  async findSubscriptionsInGracePeriod(tx?: PrismaTx) {
    return this.db(tx).subscription.findMany({
      where: { status: 'grace_period' },
      include: { plan: true, vm: true },
    });
  }

  async createSubscription(data: any, tx?: PrismaTx) {
    return this.db(tx).subscription.create({ data });
  }

  async updateSubscription(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).subscription.update({ where: { id }, data });
  }

  async countSubscriptions(where?: any, tx?: PrismaTx) {
    return this.db(tx).subscription.count({ where });
  }

  async findSubscriptionsPaginated(skip: number, take: number, where?: any, tx?: PrismaTx) {
    const [subscriptions, total] = await Promise.all([
      this.db(tx).subscription.findMany({
        where,
        include: { plan: true, user: { select: { id: true, name: true, email: true } }, vm: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db(tx).subscription.count({ where }),
    ]);
    return { subscriptions, total };
  }

  async findVmById(id: string, tx?: PrismaTx) {
    return this.db(tx).vm.findUnique({ where: { id } });
  }

  async findPoolByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).resourcePool.findFirst({ where: { userId } });
  }

  async findFirstActiveNode(tx?: PrismaTx) {
    return this.db(tx).node.findFirst({ where: { isActive: true } });
  }

  async findAvailableIp(tx?: PrismaTx) {
    return this.db(tx).ipAddress.findFirst({
      where: { isAssigned: false },
    });
  }

  async createVm(data: any, tx?: PrismaTx) {
    return this.db(tx).vm.create({ data });
  }

  async createAllocation(data: any, tx?: PrismaTx) {
    return this.db(tx).resourceAllocation.create({ data });
  }

  async lockPoolById(poolId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe('SELECT * FROM "ResourcePool" WHERE id = $1 FOR UPDATE', poolId);
  }

  async sumAllocationsByPool(poolId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      'SELECT COALESCE(SUM(cores), 0) as cores, COALESCE(SUM("memoryMb"), 0) as "memoryMb", COALESCE(SUM("diskGb"), 0) as "diskGb", COALESCE(SUM(ips), 0) as ips FROM "ResourceAllocation" WHERE "poolId" = $1',
      poolId,
    );
  }

  async createInvoice(data: any, tx?: PrismaTx) {
    return this.db(tx).invoice.create({ data });
  }

  async findLastInvoice(userId: string, tx?: PrismaTx) {
    return this.db(tx).invoice.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async findTemplateById(id: string, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findUnique({ where: { id } });
  }

  async updateVm(vmId: string, data: any, tx?: PrismaTx) {
    return this.db(tx).vm.update({ where: { id: vmId }, data });
  }
}
