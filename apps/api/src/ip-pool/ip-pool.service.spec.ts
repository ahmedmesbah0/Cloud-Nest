import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { IpPoolService } from './ip-pool.service';
import { IpPoolRepository } from './ip-pool.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('IpPoolService', () => {
  let service: IpPoolService;
  let mockRepo: any;
  let mockPrisma: any;

  const store = {
    pools: new Map<string, any>(),
    addresses: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.pools.clear();
    store.addresses.clear();

    mockRepo = {
      findMany: jest.fn(async () => {
        return Array.from(store.pools.values()).map((p: any) => ({
          ...p,
          _count: {
            addresses: Array.from(store.addresses.values()).filter((a: any) => a.poolId === p.id).length,
          },
        }));
      }),
      findById: jest.fn(async (id: string, includeAddresses = false) => {
        const pool = store.pools.get(id);
        if (!pool) return null;
        if (includeAddresses) {
          const addresses = Array.from(store.addresses.values())
            .filter((a: any) => a.poolId === pool.id)
            .sort((a: any, b: any) => a.address.localeCompare(b.address));
          return { ...pool, addresses, _count: { addresses: addresses.length } };
        }
        return { ...pool, _count: { addresses: Array.from(store.addresses.values()).filter((a: any) => a.poolId === pool.id).length } };
      }),
      create: jest.fn(async (data: any, _tx?: any) => {
        const pool = { id: `pool-${store.pools.size + 1}`, ...data, createdAt: new Date() };
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
      findAddressById: jest.fn(async (id: string) => {
        for (const addr of store.addresses.values()) {
          if ((addr as any).id === id) return addr;
        }
        return null;
      }),
      findAddressByAddress: jest.fn(async (address: string) => {
        for (const addr of store.addresses.values()) {
          if ((addr as any).address === address) return addr;
        }
        return null;
      }),
      findAvailableIp: jest.fn(async (poolId: string) => {
        const addrs = Array.from(store.addresses.values())
          .filter((a: any) => a.poolId === poolId && a.isAssigned === false && a.vmId === null)
          .sort((a: any, b: any) => a.address.localeCompare(b.address));
        return addrs[0] || null;
      }),
      createAddress: jest.fn(async (data: any, _tx?: any) => {
        const addr = {
          id: `addr-${store.addresses.size + 1}`,
          ...data,
          isAssigned: false,
          ptrRecord: null,
          vmId: null,
        };
        store.addresses.set(addr.id, addr);
        return addr;
      }),
      updateAddress: jest.fn(async (id: string, data: any, _tx?: any) => {
        const addr = store.addresses.get(id);
        if (!addr) throw new Error('Not found');
        Object.assign(addr, data);
        return addr;
      }),
      deleteAddress: jest.fn(async (id: string, _tx?: any) => {
        store.addresses.delete(id);
      }),
    };

    mockPrisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpPoolService,
        { provide: IpPoolRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<IpPoolService>(IpPoolService);
  });

  describe('create / get / list', () => {
    it('creates an IP pool', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      expect(pool.id).toBeDefined();
      expect(pool.name).toBe('pool-a');
    });

    it('gets a pool by id', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const found = await service.get(pool.id);
      expect(found.id).toBe(pool.id);
    });

    it('throws on get for non-existent pool', async () => {
      await expect(service.get('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('lists all pools', async () => {
      await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      await service.create({ name: 'pool-b', subnet: '10.0.1.0/24', gateway: '10.0.1.1' });
      const pools = await service.list();
      expect(pools).toHaveLength(2);
    });
  });

  describe('update / delete', () => {
    it('updates a pool', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const updated = await service.update(pool.id, { name: 'pool-rename' });
      expect(updated.name).toBe('pool-rename');
    });

    it('throws on update for non-existent pool', async () => {
      await expect(service.update('nonexistent', { name: 'xxx' })).rejects.toThrow(NotFoundException);
    });

    it('deletes a pool with no addresses', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const result = await service.delete(pool.id);
      expect(result.success).toBe(true);
    });

    it('throws on delete for pool with addresses', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      await service.addIp(pool.id, '10.0.0.10');
      await expect(service.delete(pool.id)).rejects.toThrow(BadRequestException);
    });

    it('throws on delete for non-existent pool', async () => {
      await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addIp / removeIp', () => {
    it('adds an IP to a pool', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const ip = await service.addIp(pool.id, '10.0.0.10');
      expect(ip.address).toBe('10.0.0.10');
      expect(ip.poolId).toBe(pool.id);
    });

    it('throws on addIp for non-existent pool', async () => {
      await expect(service.addIp('nonexistent', '10.0.0.10')).rejects.toThrow(NotFoundException);
    });

    it('throws on addIp for duplicate address', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      await service.addIp(pool.id, '10.0.0.10');
      await expect(service.addIp(pool.id, '10.0.0.10')).rejects.toThrow(ConflictException);
    });

    it('removes an IP', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const ip = await service.addIp(pool.id, '10.0.0.10');
      const result = await service.removeIp(ip.id);
      expect(result.success).toBe(true);
    });

    it('throws on removeIp for non-existent IP', async () => {
      await expect(service.removeIp('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws on removeIp for assigned IP', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const ip = await service.addIp(pool.id, '10.0.0.10');
      store.addresses.get(ip.id)!.isAssigned = true;
      await expect(service.removeIp(ip.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('setPtrRecord', () => {
    it('sets PTR record', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const ip = await service.addIp(pool.id, '10.0.0.10');
      const updated = await service.setPtrRecord(ip.id, 'mail.example.com');
      expect(updated.ptrRecord).toBe('mail.example.com');
    });

    it('throws on setPtrRecord for non-existent IP', async () => {
      await expect(service.setPtrRecord('nonexistent', 'x.com')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableIp', () => {
    it('returns an available IP', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      await service.addIp(pool.id, '10.0.0.10');
      await service.addIp(pool.id, '10.0.0.11');
      const available = await service.getAvailableIp(pool.id);
      expect(available).not.toBeNull();
      expect(available!.isAssigned).toBe(false);
    });
  });

  describe('audit logs', () => {
    it('create writes audit log inside $transaction', async () => {
      await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ip-pool.create', resource: 'ipPool' }),
      });
    });

    it('update writes audit log inside $transaction', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      mockPrisma.auditLog.create.mockClear();
      await service.update(pool.id, { name: 'pool-rename' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ip-pool.update', resource: 'ipPool' }),
      });
    });

    it('delete writes audit log inside $transaction', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      mockPrisma.auditLog.create.mockClear();
      await service.delete(pool.id);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ip-pool.delete', resource: 'ipPool' }),
      });
    });

    it('addIp writes audit log inside $transaction', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      mockPrisma.auditLog.create.mockClear();
      await service.addIp(pool.id, '10.0.0.10');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ip-pool.add-ip', resource: 'ipAddress' }),
      });
    });

    it('removeIp writes audit log inside $transaction', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const ip = await service.addIp(pool.id, '10.0.0.10');
      mockPrisma.auditLog.create.mockClear();
      await service.removeIp(ip.id);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ip-pool.remove-ip', resource: 'ipAddress' }),
      });
    });

    it('setPtrRecord writes audit log inside $transaction', async () => {
      const pool = await service.create({ name: 'pool-a', subnet: '10.0.0.0/24', gateway: '10.0.0.1' });
      const ip = await service.addIp(pool.id, '10.0.0.10');
      mockPrisma.auditLog.create.mockClear();
      await service.setPtrRecord(ip.id, 'mail.example.com');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ip-pool.set-ptr', resource: 'ipAddress' }),
      });
    });
  });
});
