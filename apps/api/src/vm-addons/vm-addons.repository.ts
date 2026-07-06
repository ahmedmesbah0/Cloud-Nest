import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class VmAddonsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).vmAddOn.findUnique({ where: { id }, include: { vm: true } });
  }

  async findByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).vmAddOn.findMany({ where: { vmId } });
  }

  async sumQuantityByType(vmId: string, type: string, tx?: PrismaTx) {
    const result = await this.db(tx).vmAddOn.aggregate({
      where: { vmId, type: type as any },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  async create(data: { vmId: string; type: string; quantity: number; priceCredits: number; metadata?: any }, tx?: PrismaTx) {
    return this.db(tx).vmAddOn.create({ data: data as any });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).vmAddOn.delete({ where: { id } });
  }

  async findVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).vm.findUnique({
      where: { id: vmId },
      include: { subscription: true, allocation: true },
    });
  }
}
