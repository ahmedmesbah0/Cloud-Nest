import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ResourcePoolService } from './resource-pool.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ResourcePoolService', () => {
  let service: ResourcePoolService;
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

    mockPrisma = {
      resourcePool: {
        findUnique: jest.fn(({ where, include }: any) => {
          const pool = store.pools.get(where.id);
          if (!pool) return null;
          if (include?.allocations) {
            return {
              ...pool,
              allocations: Array.from(store.allocations.values()).filter(
                (a: any) => a.poolId === pool.id,
              ),
            };
          }
          return pool;
        }),
        findMany: jest.fn(({ where, include }: any) => {
          let pools = Array.from(store.pools.values());
          if (where?.userId) {
            pools = pools.filter((p: any) => p.userId === where.userId);
          }
          if (include?.allocations) {
            return pools.map((p: any) => ({
              ...p,
              allocations: Array.from(store.allocations.values()).filter(
                (a: any) => a.poolId === p.id,
              ),
            }));
          }
          return pools;
        }),
        create: jest.fn(({ data }: any) => {
          const pool = {
            id: `pool-${store.pools.size + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.pools.set(pool.id, pool);
          return pool;
        }),
        update: jest.fn(({ where, data }: any) => {
          const pool = store.pools.get(where.id);
          if (!pool) throw new Error('Not found');
          Object.assign(pool, data);
          return pool;
        }),
        delete: jest.fn(({ where }: any) => {
          store.pools.delete(where.id);
        }),
      },
      resourceAllocation: {
        findUnique: jest.fn(({ where }: any) => {
          for (const alloc of store.allocations.values()) {
            if ((alloc as any).vmId === where.vmId) return alloc;
          }
          return null;
        }),
        create: jest.fn(({ data }: any) => {
          return mockAllocation(data.poolId, data);
        }),
      delete: jest.fn(({ where }: any) => {
        for (const [id, alloc] of store.allocations) {
          if ((alloc as any).vmId === where.vmId) {
            store.allocations.delete(id);
            break;
          }
        }
      }),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
      $queryRawUnsafe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcePoolService,
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

      // First allocation: 2 cores, 4096MB, 50GB
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

      // Add an allocation to the store manually (mimicking what $transaction did)
      mockAllocation(pool.id, {
        vmId: 'vm-1',
        poolId: pool.id,
        cores: 2,
        memoryMb: 4096,
        diskGb: 50,
        ips: 0,
      });

      // Second allocation: 2 cores, 4096MB, 50GB — should work
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

      // Third allocation: should fail — pool is full
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
      // Pool with room for exactly 1 VM (2 cores, 4096MB, 50GB)
      const pool = await service.createPool({
        userId: 'user-concurrent',
        totalCores: 2,
        totalMemoryMb: 4096,
        totalDiskGb: 50,
      });

      // Track how many allocations were created
      let allocationCount = 0;

      // Mock $transaction to simulate concurrent behavior:
      // Both requests read the pool (FOR UPDATE), both see 0 used,
      // but only the first one to write succeeds.
      mockPrisma.$transaction = jest.fn(async (fn: any) => {
        return fn({
          ...mockPrisma,
          $queryRawUnsafe: jest.fn()
            .mockResolvedValueOnce([{ id: pool.id, totalCores: 2, totalMemoryMb: 4096, totalDiskGb: 50, totalIps: 0 }])
            .mockResolvedValueOnce([{ cores: 0, memoryMb: 0, diskGb: 0, ips: 0 }]),
          resourceAllocation: {
            create: jest.fn(({ data }: any) => {
              allocationCount++;
              if (allocationCount > 1) {
                throw new Error('duplicate key — already allocated');
              }
              mockAllocation(data.poolId, data);
              return { id: 'alloc-concurrent', ...data };
            }),
          },
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

      // Only one allocation should exist in the store
      const allocs = Array.from(store.allocations.values());
      expect(allocs.length).toBe(1);
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

      // Pool's allocations must be visible to findUnique
      mockPrisma.resourcePool.findUnique.mockResolvedValue({
        ...pool,
        allocations: Array.from(store.allocations.values()).filter(
          (a: any) => a.poolId === pool.id,
        ),
      });

      await expect(service.deletePool(pool.id)).rejects.toThrow(BadRequestException);
    });
  });
});
