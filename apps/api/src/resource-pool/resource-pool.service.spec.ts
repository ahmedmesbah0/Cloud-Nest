import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ResourcePoolService } from './resource-pool.service';
import { ResourcePoolRepository } from './resource-pool.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('ResourcePoolService', () => {
  let service: ResourcePoolService;
  let mockRepo: any;
  let mockPrisma: any;

  const store = {
    pools: new Map<string, any>(),
    allocations: new Map<string, any>(),
  };

  const mockAllocation = (poolId: string, data: any) => {
    const alloc = {
      id: `alloc-${store.allocations.size + 1}`,
      poolId,
      ...data,
    };
    store.allocations.set(alloc.id, alloc);
    return alloc;
  };

  beforeEach(async () => {
    store.pools.clear();
    store.allocations.clear();

    mockRepo = {
      findById: jest.fn(async (id: string, includeAllocations = false, _tx?: any) => {
        const pool = store.pools.get(id);
        if (!pool) return null;
        if (includeAllocations) {
          return {
            ...pool,
            allocations: Array.from(store.allocations.values()).filter(
              (a: any) => a.poolId === pool.id,
            ),
          };
        }
        return pool;
      }),
      findMany: jest.fn(async (userId: string) => {
        return Array.from(store.pools.values())
          .filter((p: any) => p.userId === userId)
          .map((p: any) => ({
            ...p,
            allocations: Array.from(store.allocations.values()).filter(
              (a: any) => a.poolId === p.id,
            ),
          }));
      }),
      create: jest.fn(async (data: any, _tx?: any) => {
        const pool = {
          id: `pool-${store.pools.size + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.pools.set(pool.id, pool);
        return pool;
      }),
      update: jest.fn(async (id: string, data: any, _tx?: any) => {
        const pool = store.pools.get(id);
        if (!pool) throw new Error('Not found');
        Object.assign(pool, data);
        return pool;
      }),
      delete: jest.fn(async (id: string, _tx?: any) => {
        store.pools.delete(id);
      }),
      findAllocationByVmId: jest.fn(async (vmId: string) => {
        for (const alloc of store.allocations.values()) {
          if ((alloc as any).vmId === vmId) return alloc;
        }
        return null;
      }),
      createAllocation: jest.fn(async (data: any, _tx?: any) => {
        return mockAllocation(data.poolId, data);
      }),
      deleteAllocation: jest.fn(async (vmId: string, _tx?: any) => {
        for (const [id, alloc] of store.allocations) {
          if ((alloc as any).vmId === vmId) {
            store.allocations.delete(id);
            break;
          }
        }
      }),
    };

    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcePoolService,
        { provide: ResourcePoolRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ResourcePoolService>(ResourcePoolService);
  });

  describe('createPool / getPool', () => {
    it('creates a pool and retrieves it', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 4,
        totalMemoryMb: 8192,
        totalDiskGb: 100,
      });

      expect(pool.id).toBeDefined();
      expect(pool.totalCores).toBe(4);

      const retrieved = await service.getPool(pool.id);
      expect(retrieved.id).toBe(pool.id);
    });
  });

  describe('getPoolUsage / getPoolAvailable', () => {
    it('returns correct usage and available for empty pool', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 8,
        totalMemoryMb: 16384,
        totalDiskGb: 200,
      });

      const usage = await service.getPoolUsage(pool.id);
      expect(usage).toEqual({ cores: 0, memoryMb: 0, diskGb: 0, ips: 0 });

      const available = await service.getPoolAvailable(pool.id);
      expect(available).toEqual({ cores: 8, memoryMb: 16384, diskGb: 200, ips: 0 });
    });
  });

  describe('allocateResources — admission control', () => {
    it('allocates when resources are sufficient', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 4,
        totalMemoryMb: 8192,
        totalDiskGb: 100,
      });

      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { id: pool.id, totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100, totalIps: 0 },
      ]);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { cores: 0, memoryMb: 0, diskGb: 0, ips: 0 },
      ]);

      const result = await service.allocateResources({
        poolId: pool.id,
        vmId: 'vm-1',
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Resources allocated');
    });

    it('rejects allocation that exceeds pool limits', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 2,
        totalMemoryMb: 4096,
        totalDiskGb: 50,
      });

      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { id: pool.id, totalCores: 2, totalMemoryMb: 4096, totalDiskGb: 50, totalIps: 0 },
      ]);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { cores: 0, memoryMb: 0, diskGb: 0, ips: 0 },
      ]);

      await expect(
        service.allocateResources({
          poolId: pool.id,
          vmId: 'vm-over',
          cores: 4,
          memoryMb: 4096,
          diskGb: 50,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects allocation when pool does not exist', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      await expect(
        service.allocateResources({
          poolId: 'nonexistent',
          vmId: 'vm-1',
          cores: 1,
          memoryMb: 1024,
          diskGb: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('correctly accounts for existing allocations', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 4,
        totalMemoryMb: 8192,
        totalDiskGb: 100,
      });

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: pool.id, totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100, totalIps: 0 },
        ])
        .mockResolvedValueOnce([
          { cores: 0, memoryMb: 0, diskGb: 0, ips: 0 },
        ]);

      await service.allocateResources({
        poolId: pool.id,
        vmId: 'vm-1',
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });

      mockAllocation(pool.id, {
        vmId: 'vm-1',
        poolId: pool.id,
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
        ips: 0,
      });

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: pool.id, totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100, totalIps: 0 },
        ])
        .mockResolvedValueOnce([
          { cores: 2, memoryMb: 4096, diskGb: 50, ips: 0 },
        ]);

      const result = await service.allocateResources({
        poolId: pool.id,
        vmId: 'vm-2',
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });
      expect(result.success).toBe(true);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: pool.id, totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100, totalIps: 0 },
        ])
        .mockResolvedValueOnce([
          { cores: 4, memoryMb: 8192, diskGb: 100, ips: 0 },
        ]);

      await expect(
        service.allocateResources({
          poolId: pool.id,
          vmId: 'vm-3',
          cores: 1,
          memoryMb: 1024,
          diskGb: 10,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('concurrent admission control — critical test', () => {
    it('allows exactly one of two concurrent requests when pool has room for only one', async () => {
      const pool = await service.createPool({
        userId: 'user-concurrent',
        totalCores: 2,
        totalMemoryMb: 4096,
        totalDiskGb: 50,
      });

      let allocationCount = 0;

      const origCreateAllocation = mockRepo.createAllocation;
      mockRepo.createAllocation = jest.fn(async (data: any, _tx?: any) => {
        allocationCount++;
        if (allocationCount > 1) {
          throw new Error('duplicate key — already allocated');
        }
        return origCreateAllocation(data, _tx);
      });

      mockPrisma.$transaction = jest.fn(async (fn: any) => {
        return fn({
          ...mockPrisma,
          $queryRawUnsafe: jest.fn()
            .mockResolvedValueOnce([{ id: pool.id, totalCores: 2, totalMemoryMb: 4096, totalDiskGb: 50, totalIps: 0 }])
            .mockResolvedValueOnce([{ cores: 0, memoryMb: 0, diskGb: 0, ips: 0 }]),
        });
      });

      const req1 = service.allocateResources({
        poolId: pool.id,
        vmId: 'vm-concurrent-1',
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });

      const req2 = service.allocateResources({
        poolId: pool.id,
        vmId: 'vm-concurrent-2',
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });

      const results = await Promise.allSettled([req1, req2]);
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      expect(succeeded).toBe(1);
      expect(rejected).toBe(1);

      const allocs = Array.from(store.allocations.values());
      expect(allocs.length).toBe(1);
    });
  });

  describe('audit logs', () => {
    it('createPool writes audit log inside $transaction', async () => {
      await service.createPool({ userId: 'user-1', totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100 });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'resource-pool.create', resource: 'resourcePool' }),
      });
    });

    it('updatePool writes audit log inside $transaction', async () => {
      const pool = await service.createPool({ userId: 'user-1', totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100 });
      mockPrisma.auditLog.create.mockClear();
      await service.updatePool(pool.id, { totalCores: 8 });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'resource-pool.update', resource: 'resourcePool' }),
      });
    });

    it('deletePool writes audit log inside $transaction', async () => {
      const pool = await service.createPool({ userId: 'user-1', totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100 });
      mockPrisma.auditLog.create.mockClear();
      await service.deletePool(pool.id);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'resource-pool.delete', resource: 'resourcePool' }),
      });
    });

    it('releaseResources writes audit log inside $transaction', async () => {
      const pool = await service.createPool({ userId: 'user-1', totalCores: 4, totalMemoryMb: 8192, totalDiskGb: 100 });
      mockAllocation(pool.id, { vmId: 'vm-rel', cores: 2, memoryMb: 4096, diskGb: 50, ips: 0 });
      mockPrisma.auditLog.create.mockClear();
      await service.releaseResources('vm-rel');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'resource-pool.release', resource: 'resourceAllocation' }),
      });
    });
  });

  describe('releaseResources / updatePool / deletePool', () => {
    it('releases resources for a VM', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 4,
        totalMemoryMb: 8192,
        totalDiskGb: 100,
      });

      mockAllocation(pool.id, {
        vmId: 'vm-to-release',
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
        ips: 0,
      });

      expect(store.allocations.size).toBe(1);

      const result = await service.releaseResources('vm-to-release');
      expect(result.success).toBe(true);
      expect(store.allocations.size).toBe(0);
    });

    it('succeeds silently when releasing non-existent VM', async () => {
      const result = await service.releaseResources('nonexistent');
      expect(result.success).toBe(true);
    });

    it('updates pool limits', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 2,
        totalMemoryMb: 4096,
        totalDiskGb: 50,
      });

      const updated = await service.updatePool(pool.id, { totalCores: 8 });
      expect(updated.totalCores).toBe(8);
    });

    it('rejects deletion of pool with active allocations', async () => {
      const pool = await service.createPool({
        userId: 'user-1',
        totalCores: 2,
        totalMemoryMb: 4096,
        totalDiskGb: 50,
      });

      mockAllocation(pool.id, {
        vmId: 'vm-active',
        cores: 1,
        memoryMb: 1024,
        diskGb: 10,
        ips: 0,
      });

      mockRepo.findById.mockResolvedValue({
        ...pool,
        allocations: Array.from(store.allocations.values()).filter(
          (a: any) => a.poolId === pool.id,
        ),
      });

      await expect(service.deletePool(pool.id)).rejects.toThrow(BadRequestException);
    });
  });
});
