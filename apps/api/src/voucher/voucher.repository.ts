import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class VoucherRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findByCode(code: string, tx?: PrismaTx) {
    return this.db(tx).voucherCode.findUnique({ where: { code } });
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).voucherCode.findUnique({ where: { id } });
  }

  async findMany(tx?: PrismaTx) {
    return this.db(tx).voucherCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(data: any, tx?: PrismaTx) {
    return this.db(tx).voucherCode.create({ data });
  }

  async update(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).voucherCode.update({ where: { id }, data });
  }

  async findRedemption(voucherId: string, userId: string, tx?: PrismaTx) {
    return this.db(tx).voucherRedemption.findFirst({
      where: { voucherId, userId },
    });
  }

  async createRedemption(data: { voucherId: string; userId: string }, tx?: PrismaTx) {
    return this.db(tx).voucherRedemption.create({ data });
  }

  async findPlanById(planId: string, tx?: PrismaTx) {
    return this.db(tx).plan.findUnique({ where: { id: planId } });
  }

  async createSubscription(data: {
    userId: string;
    planId: string;
    status: string;
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
    backupLimit: number;
    snapshotLimit: number;
    nextRenewalAt: Date;
  }, tx?: PrismaTx) {
    return this.db(tx).subscription.create({ data });
  }
}
