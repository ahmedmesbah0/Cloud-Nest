import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SshKeysService } from './ssh-keys.service';
import { SshKeysRepository } from './ssh-keys.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('SshKeysService', () => {
  let service: SshKeysService;
  let mockRepo: any;
  let mockPrisma: any;

  const store = { keys: new Map<string, any>() };

  beforeEach(async () => {
    store.keys.clear();

    mockRepo = {
      findMany: jest.fn(async (userId: string, search?: string) => {
        return Array.from(store.keys.values())
          .filter((k: any) => k.userId === userId && k.deletedAt === null)
          .filter((k: any) =>
            !search ||
            k.name.toLowerCase().includes(search.toLowerCase()) ||
            (k.fingerprint || '').toLowerCase().includes(search.toLowerCase()),
          )
          .sort((a: any, b: any) => b.createdAt - a.createdAt);
      }),
      findDeleted: jest.fn(async (userId: string) => {
        return Array.from(store.keys.values())
          .filter((k: any) => k.userId === userId && k.deletedAt !== null)
          .sort((a: any, b: any) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));
      }),
      findById: jest.fn(async (id: string) => store.keys.get(id) ?? null),
      create: jest.fn(async (data: any, _tx?: any) => {
        const key = { id: `key-${store.keys.size + 1}`, ...data, createdAt: new Date(), deletedAt: null };
        store.keys.set(key.id, key);
        return key;
      }),
      softDelete: jest.fn(async (id: string, _tx?: any) => {
        const k = store.keys.get(id);
        if (k) store.keys.set(id, { ...k, deletedAt: new Date() });
      }),
      restore: jest.fn(async (id: string, _tx?: any) => {
        const k = store.keys.get(id);
        if (k) store.keys.set(id, { ...k, deletedAt: null });
      }),
      hardDelete: jest.fn(async (id: string, _tx?: any) => {
        store.keys.delete(id);
      }),
      updateFingerprint: jest.fn(async (id: string, fingerprint: string, _tx?: any) => {
        const k = store.keys.get(id);
        if (k) store.keys.set(id, { ...k, fingerprint });
      }),
    };

    mockPrisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SshKeysService,
        { provide: SshKeysRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SshKeysService>(SshKeysService);
  });

  describe('create / list / search', () => {
    it('creates an SSH key with fingerprint', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE7s9vKZ test');
      expect(key.id).toBeDefined();
      expect(key.name).toBe('my-key');
      expect(key.fingerprint).toMatch(/^SHA256:/);
    });

    it('lists keys for a user', async () => {
      await service.create('user-1', 'a', 'ssh-rsa AAAA test');
      await service.create('user-1', 'b', 'ssh-rsa BBBB test');
      await service.create('user-2', 'c', 'ssh-rsa CCCC test');
      const keys = await service.list('user-1');
      expect(keys).toHaveLength(2);
    });

    it('filters by search', async () => {
      await service.create('user-1', 'laptop-key', 'ssh-rsa AAAA test');
      await service.create('user-1', 'desktop', 'ssh-rsa BBBB test');
      const result = await service.list('user-1', 'laptop');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('laptop-key');
    });
  });

  describe('soft delete / restore / hard delete', () => {
    it('soft-deletes own key', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      const result = await service.delete('user-1', key.id, true);
      expect(result.success).toBe(true);
      expect(mockRepo.softDelete).toHaveBeenCalledWith(key.id, mockPrisma);
    });

    it('requires confirmation to delete', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await expect(service.delete('user-1', key.id)).rejects.toThrow(NotFoundException);
      await expect(service.delete('user-1', key.id, false)).rejects.toThrow(NotFoundException);
    });

    it('throws on delete for non-existent key', async () => {
      await expect(service.delete('user-1', 'nonexistent', true)).rejects.toThrow(NotFoundException);
    });

    it('throws on delete for wrong user', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await expect(service.delete('user-2', key.id, true)).rejects.toThrow(NotFoundException);
    });

    it('throws when deleting another user\'s key (confirm=true bypass blocked at ownership check)', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await expect(service.delete('user-2', key.id, true)).rejects.toThrow(NotFoundException);
    });

    it('restores a soft-deleted key', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await service.delete('user-1', key.id, true);
      const result = await service.restore('user-1', key.id);
      expect(result.success).toBe(true);
      expect(mockRepo.restore).toHaveBeenCalledWith(key.id, mockPrisma);
    });

    it('throws when restoring a non-deleted key', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await expect(service.restore('user-1', key.id)).rejects.toThrow(NotFoundException);
    });

    it('hard-deletes a key', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await service.delete('user-1', key.id, true);
      const result = await service.hardDelete('user-1', key.id, true);
      expect(result.success).toBe(true);
      expect(store.keys.size).toBe(0);
    });

    it('requires confirmation to hard-delete', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await service.delete('user-1', key.id, true);
      await expect(service.hardDelete('user-1', key.id)).rejects.toThrow(NotFoundException);
    });

    it('lists deleted keys separately from active', async () => {
      const keyA = await service.create('user-1', 'a', 'ssh-rsa AAAA test');
      const keyB = await service.create('user-1', 'b', 'ssh-rsa BBBB test');
      await service.delete('user-1', keyA.id, true);
      const active = await service.list('user-1');
      const deleted = await service.listDeleted('user-1');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(keyB.id);
      expect(deleted).toHaveLength(1);
      expect(deleted[0].id).toBe(keyA.id);
    });
  });

  describe('audit logs', () => {
    it('create writes audit log inside $transaction', async () => {
      await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ssh-key.create', resource: 'sshKey', userId: 'user-1' }),
      });
    });

    it('delete writes audit log inside $transaction', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      mockPrisma.auditLog.create.mockClear();
      await service.delete('user-1', key.id, true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ssh-key.delete', resource: 'sshKey', userId: 'user-1' }),
      });
    });

    it('restore writes audit log inside $transaction', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      mockPrisma.auditLog.create.mockClear();
      await service.delete('user-1', key.id, true);
      await service.restore('user-1', key.id);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ssh-key.restore', resource: 'sshKey', userId: 'user-1' }),
      });
    });

    it('hard delete writes audit log inside $transaction', async () => {
      const key = await service.create('user-1', 'my-key', 'ssh-rsa AAAA test');
      await service.delete('user-1', key.id, true);
      mockPrisma.auditLog.create.mockClear();
      await service.hardDelete('user-1', key.id, true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ssh-key.hard-delete', resource: 'sshKey', userId: 'user-1' }),
      });
    });
  });
});
