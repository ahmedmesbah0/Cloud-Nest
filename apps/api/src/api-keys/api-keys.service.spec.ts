import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysRepository } from './api-keys.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let mockRepo: any;
  let mockPrisma: any;

  const store = { keys: new Map<string, any>() };

  beforeEach(async () => {
    store.keys.clear();

    mockRepo = {
      findMany: jest.fn(async (userId: string) => {
        return Array.from(store.keys.values())
          .filter((k: any) => k.userId === userId)
          .sort((a: any, b: any) => b.createdAt - a.createdAt)
          .map((k: any) => ({
            id: k.id, name: k.name, key: k.key, lastUsedAt: k.lastUsedAt,
            allowedIps: k.allowedIps, notifyForeignIp: k.notifyForeignIp,
            createdAt: k.createdAt,
          }));
      }),
      findById: jest.fn(async (id: string) => {
        for (const key of store.keys.values()) {
          if ((key as any).id === id) return key;
        }
        return null;
      }),
      findByKey: jest.fn(async (key: string) => {
        for (const k of store.keys.values()) {
          if ((k as any).key === key) return k;
        }
        return null;
      }),
      create: jest.fn(async (data: any, _tx?: any) => {
        const key = { id: `key-${store.keys.size + 1}`, ...data, createdAt: new Date() };
        store.keys.set(key.id, key);
        return key;
      }),
      update: jest.fn(async (id: string, data: any, _tx?: any) => {
        const k = store.keys.get(id);
        if (k) store.keys.set(id, { ...k, ...data });
        return store.keys.get(id);
      }),
      updateLastUsed: jest.fn(async (id: string, _tx?: any) => {
        const k = store.keys.get(id);
        if (k) store.keys.set(id, { ...k, lastUsedAt: new Date() });
      }),
      delete: jest.fn(async (id: string, _tx?: any) => {
        store.keys.delete(id);
      }),
    };

    mockPrisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: ApiKeysRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('create / list / delete', () => {
    it('creates an API key without IP restriction by default', async () => {
      const result = await service.create('user-1', 'my-key');
      expect(result.id).toBeDefined();
      expect(result.name).toBe('my-key');
      expect(result.key).toContain('cn_');
      expect(result.allowedIps).toBeNull();
      expect(result.notifyForeignIp).toBe(true);
    });

    it('creates an API key with IP allowlist when provided', async () => {
      const result = await service.create('user-1', 'ci', '203.0.113.0/24', false);
      expect(result.allowedIps).toBe('203.0.113.0/24');
      expect(result.notifyForeignIp).toBe(false);
    });

    it('lists keys for a user (includes allowedIps + notifyForeignIp)', async () => {
      await service.create('user-1', 'a');
      await service.create('user-1', 'b', '203.0.113.1', true);
      await service.create('user-2', 'c');
      const keys = await service.list('user-1');
      expect(keys).toHaveLength(2);
      const withRestriction = keys.find((k: any) => k.name === 'b');
      expect(withRestriction.allowedIps).toBe('203.0.113.1');
    });

    it('deletes own key', async () => {
      const key = await service.create('user-1', 'my-key');
      const result = await service.delete('user-1', key.id);
      expect(result.success).toBe(true);
      expect(store.keys.size).toBe(0);
    });

    it('throws on delete for non-existent key', async () => {
      await expect(service.delete('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws on delete for wrong user', async () => {
      const key = await service.create('user-1', 'my-key');
      await expect(service.delete('user-2', key.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates allowedIps on owned key', async () => {
      const key = await service.create('user-1', 'k');
      await service.update('user-1', key.id, { allowedIps: '198.51.100.0/24' });
      const stored = store.keys.get(key.id);
      expect(stored.allowedIps).toBe('198.51.100.0/24');
    });

    it('toggles notifyForeignIp', async () => {
      const key = await service.create('user-1', 'k');
      await service.update('user-1', key.id, { notifyForeignIp: false });
      const stored = store.keys.get(key.id);
      expect(stored.notifyForeignIp).toBe(false);
    });

    it('throws on update for wrong user', async () => {
      const key = await service.create('user-1', 'k');
      await expect(service.update('user-2', key.id, { notifyForeignIp: false })).rejects.toThrow(NotFoundException);
    });
  });

  describe('authenticate (IP allowlist enforcement)', () => {
    it('authenticates a valid key from an allowed IP', async () => {
      const key = await service.create('user-1', 'ci', '203.0.113.0/24');
      const result = await service.authenticate(key.key, '203.0.113.50');
      expect(result.userId).toBe('user-1');
      expect(result.keyId).toBe(key.id);
      expect(mockRepo.updateLastUsed).toHaveBeenCalledWith(key.id);
    });

    it('rejects a valid key from outside an allowed CIDR', async () => {
      const key = await service.create('user-1', 'ci', '203.0.113.0/24');
      await expect(service.authenticate(key.key, '198.51.100.1')).rejects.toThrow(UnauthorizedException);
    });

    it('authenticates any IP when allowedIps is empty', async () => {
      const key = await service.create('user-1', 'web');
      const a = await service.authenticate(key.key, '1.2.3.4');
      const b = await service.authenticate(key.key, '9.9.9.9');
      expect(a.userId).toBe('user-1');
      expect(b.userId).toBe('user-1');
    });

    it('rejects an invalid key', async () => {
      await expect(service.authenticate('cn_invalid', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });

    it('supports single-IP (no CIDR) ranges', async () => {
      const key = await service.create('user-1', 'exact', '203.0.113.5');
      const ok = await service.authenticate(key.key, '203.0.113.5');
      expect(ok.userId).toBe('user-1');
      await expect(service.authenticate(key.key, '203.0.113.6')).rejects.toThrow(UnauthorizedException);
    });

    it('supports multiple comma-separated CIDR ranges', async () => {
      const key = await service.create('user-1', 'multi', '203.0.113.0/24, 198.51.100.0/24');
      const a = await service.authenticate(key.key, '203.0.113.10');
      const b = await service.authenticate(key.key, '198.51.100.10');
      expect(a.userId).toBe('user-1');
      expect(b.userId).toBe('user-1');
      await expect(service.authenticate(key.key, '1.1.1.1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('audit logs', () => {
    it('create writes audit log inside $transaction', async () => {
      await service.create('user-1', 'my-key');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'api-key.create', resource: 'apiKey', userId: 'user-1' }),
      });
    });

    it('delete writes audit log inside $transaction', async () => {
      const key = await service.create('user-1', 'my-key');
      mockPrisma.auditLog.create.mockClear();
      await service.delete('user-1', key.id);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'api-key.delete', resource: 'apiKey', userId: 'user-1' }),
      });
    });
  });
});
