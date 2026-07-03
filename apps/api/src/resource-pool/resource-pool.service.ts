import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PoolAllocation {
  poolId: string;
  vmId: string;
  cores: number;
  memoryMb: number;
  diskGb: number;
  ips?: number;
}

export interface PoolUsage {
  cores: number;
  memoryMb: number;
  diskGb: number;
  ips: number;
}

@Injectable()
export class ResourcePoolService {
  constructor(private readonly prisma: PrismaService) {}

  async createPool(data: {
    userId: string;
    totalCores: number;
    totalMemoryMb: number;
    totalDiskGb: number;
    totalIps?: number;
  }) {
    const pool = await this.prisma.resourcePool.create({ data });
    return pool;
  }

  async getPool(poolId: string) {
    const pool = await this.prisma.resourcePool.findUnique({
      where: { id: poolId },
      include: { allocations: true },
    });
    if (!pool) throw new BadRequestException('Resource pool not found');
    return pool;
  }

  async getUserPools(userId: string) {
    return this.prisma.resourcePool.findMany({
      where: { userId },
      include: { allocations: true },
    });
  }

  async getPoolUsage(poolId: string): Promise<PoolUsage> {
    const pool = await this.prisma.resourcePool.findUnique({
      where: { id: poolId },
      include: { allocations: true },
    });
    if (!pool) throw new BadRequestException('Resource pool not found');

    return {
      cores: pool.allocations.reduce((sum, a) => sum + a.cores, 0),
      memoryMb: pool.allocations.reduce((sum, a) => sum + a.memoryMb, 0),
      diskGb: pool.allocations.reduce((sum, a) => sum + a.diskGb, 0),
      ips: pool.allocations.reduce((sum, a) => sum + (a.ips ?? 0), 0),
    };
  }

  async getPoolAvailable(poolId: string): Promise<PoolUsage> {
    const pool = await this.prisma.resourcePool.findUnique({
      where: { id: poolId },
      include: { allocations: true },
    });
    if (!pool) throw new BadRequestException('Resource pool not found');

    const used = {
      cores: pool.allocations.reduce((sum, a) => sum + a.cores, 0),
      memoryMb: pool.allocations.reduce((sum, a) => sum + a.memoryMb, 0),
      diskGb: pool.allocations.reduce((sum, a) => sum + a.diskGb, 0),
      ips: pool.allocations.reduce((sum, a) => sum + (a.ips ?? 0), 0),
    };

    return {
      cores: pool.totalCores - used.cores,
      memoryMb: pool.totalMemoryMb - used.memoryMb,
      diskGb: pool.totalDiskGb - used.diskGb,
      ips: (pool.totalIps ?? 0) - used.ips,
    };
  }

  async updatePool(
    poolId: string,
    data: {
      totalCores?: number;
      totalMemoryMb?: number;
      totalDiskGb?: number;
      totalIps?: number;
    },
  ) {
    const pool = await this.prisma.resourcePool.update({
      where: { id: poolId },
      data,
    });
    return pool;
  }

  async deletePool(poolId: string) {
    const pool = await this.prisma.resourcePool.findUnique({
      where: { id: poolId },
      include: { allocations: true },
    });
    if (!pool) throw new BadRequestException('Resource pool not found');
    if (pool.allocations.length > 0) {
      throw new BadRequestException('Cannot delete pool with active allocations');
    }
    await this.prisma.resourcePool.delete({ where: { id: poolId } });
  }

  async allocateResources(
    allocation: PoolAllocation,
  ): Promise<{ success: boolean; message: string }> {
    return this.prisma.$transaction(async (tx) => {
      const pools = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          totalCores: number;
          totalMemoryMb: number;
          totalDiskGb: number;
          totalIps: number;
        }>
      >(
        `SELECT id, "totalCores", "totalMemoryMb", "totalDiskGb", "totalIps" FROM "ResourcePool" WHERE id = $1 FOR UPDATE`,
        allocation.poolId,
      );

      const pool = pools[0];
      if (!pool) {
        throw new BadRequestException('Resource pool not found');
      }

      const allocations = await tx.$queryRawUnsafe<
        Array<{
          cores: number;
          memoryMb: number;
          diskGb: number;
          ips: number;
        }>
      >(
        `SELECT COALESCE(SUM(cores), 0) as cores, COALESCE(SUM("memoryMb"), 0) as "memoryMb", COALESCE(SUM("diskGb"), 0) as "diskGb", COALESCE(SUM(ips), 0) as ips FROM "ResourceAllocation" WHERE "poolId" = $1`,
        allocation.poolId,
      );

      const used = allocations[0];
      const availableCores = pool.totalCores - Number(used.cores);
      const availableMemory = pool.totalMemoryMb - Number(used.memoryMb);
      const availableDisk = pool.totalDiskGb - Number(used.diskGb);
      const availableIps = (pool.totalIps ?? 0) - (Number(used.ips) || 0);

      const errors: string[] = [];
      if (allocation.cores > availableCores) errors.push(`cores: need ${allocation.cores}, available ${availableCores}`);
      if (allocation.memoryMb > availableMemory) errors.push(`memory: need ${allocation.memoryMb}MB, available ${availableMemory}MB`);
      if (allocation.diskGb > availableDisk) errors.push(`disk: need ${allocation.diskGb}GB, available ${availableDisk}GB`);
      if ((allocation.ips ?? 0) > availableIps) errors.push(`IPs: need ${allocation.ips}, available ${availableIps}`);

      if (errors.length > 0) {
        throw new ForbiddenException(`Insufficient resources: ${errors.join('; ')}`);
      }

      await tx.resourceAllocation.create({
        data: {
          poolId: allocation.poolId,
          vmId: allocation.vmId,
          cores: allocation.cores,
          memoryMb: allocation.memoryMb,
          diskGb: allocation.diskGb,
          ips: allocation.ips ?? 0,
        },
      });

      return { success: true, message: 'Resources allocated' };
    });
  }

  async releaseResources(vmId: string) {
    const allocation = await this.prisma.resourceAllocation.findUnique({
      where: { vmId },
    });
    if (!allocation) {
      return { success: true, message: 'No allocation found' };
    }
    await this.prisma.resourceAllocation.delete({ where: { vmId } });
    return { success: true, message: 'Resources released' };
  }

  async canAllocate(
    poolId: string,
    needed: { cores: number; memoryMb: number; diskGb: number; ips?: number },
  ): Promise<{ allowed: boolean; available: PoolUsage }> {
    const available = await this.getPoolAvailable(poolId);
    const allowed =
      needed.cores <= available.cores &&
      needed.memoryMb <= available.memoryMb &&
      needed.diskGb <= available.diskGb &&
      (needed.ips ?? 0) <= available.ips;

    return { allowed, available };
  }
}
