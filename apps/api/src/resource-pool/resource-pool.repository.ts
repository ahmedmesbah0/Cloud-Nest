import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class ResourcePoolRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findById(id: string, includeAllocations = false, tx?: PrismaTx) {
    return this.db(tx).resourcePool.findUnique({
      where: { id },
      include: includeAllocations ? { allocations: true } : undefined,
    });
  }

  async findMany(userId: string, tx?: PrismaTx) {
    return this.db(tx).resourcePool.findMany({
      where: { userId },
      include: { allocations: true },
    });
  }

  async create(data: {
    userId: string;
    totalCores: number;
    totalMemoryMb: number;
    totalDiskGb: number;
    totalIps?: number;
  }, tx?: PrismaTx) {
    return this.db(tx).resourcePool.create({ data });
  }

  async update(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).resourcePool.update({ where: { id }, data });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).resourcePool.delete({ where: { id } });
  }

  async findAllocationByVmId(vmId: string, tx?: PrismaTx) {
    return this.db(tx).resourceAllocation.findUnique({ where: { vmId } });
  }

  async createAllocation(data: {
    poolId: string;
    vmId: string;
    cores: number;
    memoryMb: number;
    diskGb: number;
    ips: number;
  }, tx?: PrismaTx) {
    return this.db(tx).resourceAllocation.create({ data });
  }

  async deleteAllocation(vmId: string, tx?: PrismaTx) {
    return this.db(tx).resourceAllocation.delete({ where: { vmId } });
  }

  async updateAllocation(vmId: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).resourceAllocation.update({ where: { vmId }, data });
  }

  // --- Raw SQL for pool capacity checks ---

  async lockPoolById(poolId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT id, "totalCores", "totalMemoryMb", "totalDiskGb", "totalIps" FROM "ResourcePool" WHERE id = $1 FOR UPDATE`,
      poolId,
    ) as Promise<Array<{ id: string; totalCores: number; totalMemoryMb: number; totalDiskGb: number; totalIps: number }>>;
  }

  async lockPoolByUserId(userId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT id, "totalCores", "totalMemoryMb", "totalDiskGb" FROM "ResourcePool" WHERE "userId" = $1 FOR UPDATE`,
      userId,
    ) as Promise<Array<{ id: string; totalCores: number; totalMemoryMb: number; totalDiskGb: number }>>;
  }

  async sumAllocationsByPool(poolId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT COALESCE(SUM(cores), 0) as cores, COALESCE(SUM("memoryMb"), 0) as "memoryMb", COALESCE(SUM("diskGb"), 0) as "diskGb", COALESCE(SUM(ips), 0) as ips FROM "ResourceAllocation" WHERE "poolId" = $1`,
      poolId,
    ) as Promise<Array<{ cores: number; memoryMb: number; diskGb: number; ips: number }>>;
  }

  async sumAllocationsExcludingVm(poolId: string, vmId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT COALESCE(SUM(cores), 0) as cores, COALESCE(SUM("memoryMb"), 0) as "memoryMb", COALESCE(SUM("diskGb"), 0) as "diskGb" FROM "ResourceAllocation" WHERE "poolId" = $1 AND "vmId" != $2`,
      poolId, vmId,
    ) as Promise<Array<{ cores: number; memoryMb: number; diskGb: number }>>;
  }

  async findAllocationByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT cores, "memoryMb", "diskGb" FROM "ResourceAllocation" WHERE "vmId" = $1`,
      vmId,
    ) as Promise<Array<{ cores: number; memoryMb: number; diskGb: number }>>;
  }
}
