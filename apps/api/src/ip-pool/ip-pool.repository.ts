import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class IpPoolRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findMany(tx?: PrismaTx) {
    return this.db(tx).ipPool.findMany({
      include: { _count: { select: { addresses: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, includeAddresses = false, tx?: PrismaTx) {
    return this.db(tx).ipPool.findUnique({
      where: { id },
      include: includeAddresses
        ? {
            addresses: { orderBy: { address: 'asc' } },
            _count: { select: { addresses: true } },
          }
        : { _count: { select: { addresses: true } } },
    });
  }

  async create(data: { name: string; subnet: string; gateway: string }, tx?: PrismaTx) {
    return this.db(tx).ipPool.create({ data });
  }

  async update(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).ipPool.update({ where: { id }, data });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).ipPool.delete({ where: { id } });
  }

  async findAddressById(id: string, tx?: PrismaTx) {
    return this.db(tx).ipAddress.findUnique({ where: { id } });
  }

  async findAddressByAddress(address: string, tx?: PrismaTx) {
    return this.db(tx).ipAddress.findUnique({ where: { address } });
  }

  async findAvailableIp(poolId: string, tx?: PrismaTx) {
    return this.db(tx).ipAddress.findFirst({
      where: { poolId, isAssigned: false, vmId: null },
      orderBy: { address: 'asc' },
    });
  }

  async createAddress(data: { poolId: string; address: string }, tx?: PrismaTx) {
    return this.db(tx).ipAddress.create({ data });
  }

  async updateAddress(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).ipAddress.update({ where: { id }, data });
  }

  async deleteAddress(id: string, tx?: PrismaTx) {
    return this.db(tx).ipAddress.delete({ where: { id } });
  }
}
