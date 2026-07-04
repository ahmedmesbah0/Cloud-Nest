import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResourcePoolRepository } from './resource-pool.repository';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly poolRepo: ResourcePoolRepository,
  ) {}

  async createPool(data: {
    userId: string;
    totalCores: number;
    totalMemoryMb: number;
    totalDiskGb: number;
    totalIps?: number;
  }) {
    const pool = await this.prisma.$transaction(async (tx: any) => {
      const p = await this.poolRepo.create(data, tx);
      await tx.auditLog.create({
        data: {
          userId: data.userId,
          action: 'resource-pool.create',
          resource: 'resourcePool',
          resourceId: p.id,
        },
      });
      return p;
    });
    return pool;
  }

  async getPool(poolId: string) {
    const pool = await this.poolRepo.findById(poolId, true);
    if (!pool) throw new BadRequestException('Resource pool not found');
    return pool;
  }

  async getUserPools(userId: string) {
    return this.poolRepo.findMany(userId);
  }

  async getPoolUsage(poolId: string): Promise<PoolUsage> {
    const pool = await this.poolRepo.findById(poolId, true);
    if (!pool) throw new BadRequestException('Resource pool not found');

    return {
      cores: pool.allocations.reduce((sum: number, a: any) => sum + a.cores, 0),
      memoryMb: pool.allocations.reduce((sum: number, a: any) => sum + a.memoryMb, 0),
      diskGb: pool.allocations.reduce((sum: number, a: any) => sum + a.diskGb, 0),
      ips: pool.allocations.reduce((sum: number, a: any) => sum + (a.ips ?? 0), 0),
    };
  }

  async getPoolAvailable(poolId: string): Promise<PoolUsage> {
    const pool = await this.poolRepo.findById(poolId, true);
    if (!pool) throw new BadRequestException('Resource pool not found');

    const used = {
      cores: pool.allocations.reduce((sum: number, a: any) => sum + a.cores, 0),
      memoryMb: pool.allocations.reduce((sum: number, a: any) => sum + a.memoryMb, 0),
      diskGb: pool.allocations.reduce((sum: number, a: any) => sum + a.diskGb, 0),
      ips: pool.allocations.reduce((sum: number, a: any) => sum + (a.ips ?? 0), 0),
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
    const pool = await this.prisma.$transaction(async (tx: any) => {
      const p = await this.poolRepo.update(poolId, data, tx);
      await tx.auditLog.create({
        data: {
          action: 'resource-pool.update',
          resource: 'resourcePool',
          resourceId: poolId,
        },
      });
      return p;
    });
    return pool;
  }

  async deletePool(poolId: string) {
    const pool = await this.poolRepo.findById(poolId, true);
    if (!pool) throw new BadRequestException('Resource pool not found');
    if (pool.allocations.length > 0) {
      throw new BadRequestException('Cannot delete pool with active allocations');
    }
    await this.prisma.$transaction(async (tx: any) => {
      await this.poolRepo.delete(poolId, tx);
      await tx.auditLog.create({
        data: {
          action: 'resource-pool.delete',
          resource: 'resourcePool',
          resourceId: poolId,
        },
      });
    });
  }

  async allocateResources(
    allocation: PoolAllocation,
    transactionClient?: any,
  ): Promise<{ success: boolean; message: string }> {
    const doAllocate = async (tx: any) => {
      const pools = await this.poolRepo.lockPoolById(allocation.poolId, tx);

      const pool = pools[0];
      if (!pool) {
        throw new BadRequestException('Resource pool not found');
      }

      const allocs = await this.poolRepo.sumAllocationsByPool(allocation.poolId, tx);

      const used = allocs[0];
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

      await this.poolRepo.createAllocation({
        poolId: allocation.poolId,
        vmId: allocation.vmId,
        cores: allocation.cores,
        memoryMb: allocation.memoryMb,
        diskGb: allocation.diskGb,
        ips: allocation.ips ?? 0,
      }, tx);

      return { success: true, message: 'Resources allocated' };
    };

    if (transactionClient) {
      return doAllocate(transactionClient);
    }
    return this.prisma.$transaction((tx: any) => doAllocate(tx));
  }

  async releaseResources(vmId: string) {
    const allocation = await this.poolRepo.findAllocationByVmId(vmId);
    if (!allocation) {
      return { success: true, message: 'No allocation found' };
    }
    await this.prisma.$transaction(async (tx: any) => {
      await this.poolRepo.deleteAllocation(vmId, tx);
      const pool = await this.poolRepo.findById(allocation.poolId, false, tx);
      await tx.auditLog.create({
        data: {
          userId: pool?.userId,
          action: 'resource-pool.release',
          resource: 'resourceAllocation',
          resourceId: allocation.id,
        },
      });
    });
    return { success: true, message: 'Resources released' };
  }

  async resizeAllocation(vmId: string, cores: number, memoryMb: number, diskGb: number, vmUserId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const poolRows = await this.poolRepo.lockPoolByUserId(vmUserId, tx);
      const pool = poolRows[0];
      if (!pool) throw new Error('No resource pool found');

      const usage = await this.poolRepo.sumAllocationsExcludingVm(pool.id, vmId, tx);
      const used = usage[0];
      const availCores = pool.totalCores - Number(used.cores);
      const availMem = pool.totalMemoryMb - Number(used.memoryMb);
      const availDisk = pool.totalDiskGb - Number(used.diskGb);

      const currentAlloc = await this.poolRepo.findAllocationByVm(vmId, tx);
      const old = currentAlloc[0];
      if (old) {
        const cpuDelta = cores - Number(old.cores);
        const memDelta = memoryMb - Number(old.memoryMb);
        const diskDelta = diskGb - Number(old.diskGb);
        if (cpuDelta > availCores || memDelta > availMem || diskDelta > availDisk) {
          throw new Error('Insufficient pool capacity for resize');
        }
      }
      await this.poolRepo.updateAllocation(vmId, { cores, memoryMb, diskGb }, tx);
    });
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
