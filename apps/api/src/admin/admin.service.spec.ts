import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxService } from '../proxmox/proxmox.service';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: any;

  const store = {
    users: new Map<string, any>(),
    vms: new Map<string, any>(),
    nodes: new Map<string, any>(),
    wallets: new Map<string, any>(),
    transactions: new Map<string, any>(),
    settings: new Map<string, any>(),
    auditLogs: new Map<string, any>(),
    roles: new Map<string, any>(),
    userRoles: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.users.clear();
    store.vms.clear();
    store.nodes.clear();
    store.wallets.clear();
    store.transactions.clear();
    store.settings.clear();
    store.auditLogs.clear();
    store.roles.clear();
    store.userRoles.clear();

    mockPrisma = {
      user: {
        count: jest.fn((args?: any) => {
          let users = Array.from(store.users.values());
          if (args?.where?.status) {
            users = users.filter((u: any) => u.status === args.where.status);
          }
          return users.length;
        }),
        findMany: jest.fn(({ skip, take, orderBy, include, where }: any) => {
          let users = Array.from(store.users.values());
          if (orderBy?.createdAt === 'desc') users.sort((a: any, b: any) => b.createdAt - a.createdAt);
          if (where?.isActive !== undefined) users = users.filter((u: any) => u.isActive === where.isActive);
          const result = users.slice(skip || 0, (skip || 0) + (take || 50));
          if (include?._count) {
            return result.map((u: any) => ({ ...u, _count: { vms: 0 } }));
          }
          return result;
        }),
        findUnique: jest.fn(({ where, include }: any) => {
          const u = store.users.get(where.id);
          if (!u) return null;
          if (include?.wallet) {
            return { ...u, wallet: store.wallets.get(where.id) ?? null, vms: [], _count: { vms: 0, sessions: 0, apiKeys: 0, sshKeys: 0 } };
          }
          if (include?._count) {
            return { ...u, _count: { vms: 0, sessions: 0, apiKeys: 0, sshKeys: 0 } };
          }
          return u;
        }),
        create: jest.fn(({ data }: any) => {
          const u = { id: `u-${store.users.size + 1}`, ...data, isActive: true, createdAt: new Date(), updatedAt: new Date() };
          store.users.set(u.id, u);
          return u;
        }),
        update: jest.fn(({ where, data }: any) => {
          const u = store.users.get(where.id);
          if (!u) throw new NotFoundException();
          Object.assign(u, data);
          return u;
        }),
      },
      vm: {
        count: jest.fn((args?: any) => {
          let vms = Array.from(store.vms.values());
          if (args?.where?.status) {
            vms = vms.filter((v: any) => v.status === args.where.status);
          }
          return vms.length;
        }),
        findMany: jest.fn(({ skip, take, orderBy, include }: any) => {
          const vms = Array.from(store.vms.values());
          if (orderBy?.createdAt === 'desc') vms.sort((a: any, b: any) => b.createdAt - a.createdAt);
          const result = vms.slice(skip || 0, (skip || 0) + (take || 50));
          if (include?.user) {
            return result.map((v: any) => ({ ...v, user: store.users.get(v.userId) ?? { email: 'unknown', name: null } }));
          }
          return result;
        }),
        findUnique: jest.fn(({ where }: any) => store.vms.get(where.id) ?? null),
        update: jest.fn(({ where, data }: any) => {
          const v = store.vms.get(where.id);
          if (!v) throw new NotFoundException();
          Object.assign(v, data);
          return v;
        }),
        delete: jest.fn(({ where }: any) => {
          store.vms.delete(where.id);
        }),
      },
      node: {
        count: jest.fn(() => store.nodes.size),
        findMany: jest.fn(({ include }: any) => {
          return Array.from(store.nodes.values()).map((n: any) => ({
            ...n,
            inventory: null,
            storagePools: [],
            ...(include?.inventory ? { inventory: null } : {}),
            ...(include?.storagePools ? { storagePools: [] } : {}),
          }));
        }),
        findUnique: jest.fn(({ where, include }: any) => {
          if (where.proxmoxNodeId) {
            for (const n of store.nodes.values()) {
              if ((n as any).proxmoxNodeId === where.proxmoxNodeId) {
                return { ...n, inventory: null, storagePools: [], vms: [], ...(include || {}) } as any;
              }
            }
            return null;
          }
          const n = store.nodes.get(where.id);
          if (!n) return null;
          return { ...n, inventory: null, storagePools: [], vms: [], ...(include || {}) };
        }),
        create: jest.fn(({ data }: any) => {
          const n = { id: `n-${store.nodes.size + 1}`, ...data, isActive: true, createdAt: new Date(), updatedAt: new Date() };
          store.nodes.set(n.id, n);
          return n;
        }),
        update: jest.fn(({ where, data }: any) => {
          const n = store.nodes.get(where.id);
          if (!n) throw new NotFoundException();
          Object.assign(n, data);
          return n;
        }),
      },
      wallet: {
        count: jest.fn(() => store.wallets.size),
        aggregate: jest.fn(() => {
          let total = 0;
          for (const w of store.wallets.values()) total += (w as any).balance;
          return { _sum: { balance: total } };
        }),
        upsert: jest.fn(({ where, create, update }: any) => {
          const existing = store.wallets.get(where.userId);
          if (existing) {
            existing.balance += (update.balance as any).increment || 0;
            return existing;
          }
          const w = { id: `w-${where.userId}`, ...create };
          store.wallets.set(where.userId, w);
          return w;
        }),
      },
      transaction: {
        create: jest.fn(({ data }: any) => {
          const t = { id: `tx-${store.transactions.size + 1}`, ...data };
          store.transactions.set(t.id, t);
          return t;
        }),
      },
      setting: {
        findMany: jest.fn(() => Array.from(store.settings.values())),
        findUnique: jest.fn(({ where }: any) => store.settings.get(where.key) ?? null),
        upsert: jest.fn(({ where, create, update }: any) => {
          const existing = store.settings.get(where.key);
          if (existing) {
            existing.value = update.value;
            return existing;
          }
          const s = { id: `s-${store.settings.size + 1}`, ...create };
          store.settings.set(where.key, s);
          return s;
        }),
        delete: jest.fn(({ where }: any) => {
          store.settings.delete(where.key);
        }),
      },
      auditLog: {
        count: jest.fn(() => store.auditLogs.size),
        findMany: jest.fn(({ skip, take, orderBy, include }: any) => {
          const logs = Array.from(store.auditLogs.values());
          if (orderBy?.createdAt === 'desc') logs.sort((a: any, b: any) => b.createdAt - a.createdAt);
          const result = logs.slice(skip || 0, (skip || 0) + (take || 100));
          if (include?.user) {
            return result.map((l: any) => ({ ...l, user: store.users.get((l as any).userId) ?? { email: 'unknown', name: null } }));
          }
          return result;
        }),
      },
      role: {
        findUnique: jest.fn(({ where }: any) => {
          for (const r of store.roles.values()) {
            if ((r as any).name === where.name || (r as any).id === where.id) return r;
          }
          return null;
        }),
        upsert: jest.fn(({ where, create, update }: any) => {
          const existing = store.roles.get(where.name);
          if (existing) { Object.assign(existing, update); return existing; }
          const r = { id: `r-${store.roles.size + 1}`, ...create };
          store.roles.set(r.name, r);
          return r;
        }),
        findMany: jest.fn(({ include }: any) => {
          return Array.from(store.roles.values()).map((r: any) => ({
            ...r,
            permissions: [],
            _count: { users: 0 },
            ...(include?.permissions ? { permissions: [] } : {}),
          }));
        }),
      },
      userRole: {
        findFirst: jest.fn(({ where }: any) => {
          for (const ur of store.userRoles.values()) {
            if ((ur as any).userId === where.userId) {
              if (where.role?.name) {
                const r = store.roles.get((ur as any).roleId);
                if (r && (r as any).name === where.role.name) return ur;
              }
              if (where.roleId && (ur as any).roleId === where.roleId) return ur;
            }
          }
          return null;
        }),
        findUnique: jest.fn(({ where }: any) => {
          for (const ur of store.userRoles.values()) {
            if ((ur as any).userId === where.userId_roleId?.userId && (ur as any).roleId === where.userId_roleId?.roleId) return ur;
          }
          return null;
        }),
        create: jest.fn(({ data }: any) => {
          const ur = { id: `ur-${store.userRoles.size + 1}`, ...data };
          store.userRoles.set(ur.id, ur);
          return ur;
        }),
        deleteMany: jest.fn(({ where }: any) => {
          const toDelete: string[] = [];
          for (const [id, ur] of store.userRoles) {
            if ((ur as any).userId === where.userId && (ur as any).roleId === where.roleId) {
              toDelete.push(id);
            }
          }
          for (const id of toDelete) store.userRoles.delete(id);
          return { count: toDelete.length };
        }),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProxmoxService, useValue: { refreshConfig: jest.fn() } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('getDashboardStats', () => {
    it('returns dashboard statistics', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com' });
      store.users.set('u-2', { id: 'u-2', email: 'c@d.com' });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'u-1', status: 'running' });
      store.wallets.set('u-1', { id: 'w-1', userId: 'u-1', balance: 5000 });

      const stats = await service.getDashboardStats();
      expect(stats.totalUsers).toBe(2);
      expect(stats.totalVms).toBe(1);
      expect(stats.totalBalance).toBe(5000);
    });
  });

  describe('listUsers', () => {
    it('returns paginated users', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com', createdAt: new Date() });
      store.users.set('u-2', { id: 'u-2', email: 'c@d.com', createdAt: new Date() });

      const result = await service.listUsers(1, 10);
      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('getUser', () => {
    it('returns user with relations', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com', name: 'Alice' });

      const user = await service.getUser('u-1');
      expect(user.email).toBe('a@b.com');
    });

    it('throws for non-existent user', async () => {
      await expect(service.getUser('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    it('updates user fields', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com', name: 'Alice', isActive: true });

      const updated = await service.updateUser('u-1', { name: 'Updated' });
      expect(updated.name).toBe('Updated');
    });
  });

  describe('settings', () => {
    it('gets all settings as key-value', async () => {
      store.settings.set('site_name', { key: 'site_name', value: 'CloudNest' });
      store.settings.set('max_cores', { key: 'max_cores', value: '16' });

      const result = await service.getSettings();
      expect(result.site_name).toBe('CloudNest');
      expect(result.max_cores).toBe('16');
    });

    it('sets and updates a setting', async () => {
      await service.setSetting('site_name', 'CloudNest');
      expect(store.settings.get('site_name').value).toBe('CloudNest');

      await service.setSetting('site_name', 'CloudNest Pro');
      expect(store.settings.get('site_name').value).toBe('CloudNest Pro');
    });

    it('deletes a setting', async () => {
      store.settings.set('test_key', { key: 'test_key', value: 'test' });
      await service.deleteSetting('test_key');
      expect(store.settings.has('test_key')).toBe(false);
    });

    it('throws when deleting non-existent setting', async () => {
      await expect(service.deleteSetting('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('nodes', () => {
    it('creates and lists nodes', async () => {
      const node = await service.createNode({
        proxmoxNodeId: 'pve',
        name: 'Main Node',
        host: '172.16.1.10',
        port: 8006,
      });
      expect(node.name).toBe('Main Node');

      const nodes = await service.listNodes();
      expect(nodes).toHaveLength(1);
    });

    it('rejects duplicate proxmoxNodeId', async () => {
      store.nodes.set('n-1', { id: 'n-1', proxmoxNodeId: 'pve', name: 'Existing', host: '10.0.0.1' });
      await expect(service.createNode({
        proxmoxNodeId: 'pve',
        name: 'Duplicate',
        host: '10.0.0.2',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('auditLogs', () => {
    it('returns paginated audit logs', async () => {
      store.auditLogs.set('log-1', { id: 'log-1', action: 'vm.create', resource: 'vm', createdAt: new Date() });
      store.auditLogs.set('log-2', { id: 'log-2', action: 'user.login', resource: 'auth', createdAt: new Date() });

      const result = await service.getAuditLogs(1, 10);
      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('roles', () => {
    it('assigns and lists roles', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com' });

      await service.assignRole('u-1', 'admin');
      expect(store.roles.has('admin')).toBe(true);
      expect(store.userRoles.size).toBe(1);

      const roles = await service.listRoles();
      expect(roles).toHaveLength(1);
    });

    it('removes a role from user', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com' });
      store.roles.set('admin', { id: 'role-admin', name: 'admin' });
      const role = store.roles.get('admin');
      store.userRoles.set('ur-1', { id: 'ur-1', userId: 'u-1', roleId: role.id });

      await service.removeRole('u-1', 'admin');
      expect(store.userRoles.size).toBe(0);
    });
  });
});
