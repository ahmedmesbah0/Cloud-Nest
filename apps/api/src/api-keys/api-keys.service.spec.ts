import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
            id: k.id, name: k.name, key: k.key, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt,
          }));
      }),
      findById: jest.fn(async (id: string) => {
        for (const key of store.keys.values()) {
          if ((key as any).id === id) return key;
        }
        return null;
      }),
      create: jest.fn(async (data: any, _tx?: any) => {
        const key = { id: `key-${store.keys.size + 1}`, ...data, createdAt: new Date() };
        store.keys.set(key.id, key);
        return key;
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
    it('creates an API key', async () => {
      const result = await service.create('user-1', 'my-key');
      expect(result.id).toBeDefined();
      expect(result.name).toBe('my-key');
      expect(result.key).toContain('cn_');
    });

    it('lists keys for a user', async () => {
      await service.create('user-1', 'a');
      await service.create('user-1', 'b');
      await service.create('user-2', 'c');
      const keys = await service.list('user-1');
      expect(keys).toHaveLength(2);
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
