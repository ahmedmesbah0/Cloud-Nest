import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';

describe('AdminService', () => {
  let service: AdminService;
  let mockRepo: any;
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
    allocations: new Map<string, any>(),
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
    store.allocations.clear();

    mockRepo = {
      // Users
      countUsers: jest.fn(async () => store.users.size),
      findUsersRecent: jest.fn(async () => []),
      findUsers: jest.fn(async (skip: number, take: number) => {
        const users = Array.from(store.users.values());
        users.sort((a: any, b: any) => b.createdAt - a.createdAt);
        const result = users.slice(skip || 0, (skip || 0) + (take || 50));
        return result.map((u: any) => ({ ...u, _count: { vms: 0 } }));
      }),
      findUserById: jest.fn(async (id: string) => {
        const u = store.users.get(id);
        if (!u) return null;
        return { ...u, wallet: store.wallets.get(id) ?? null, vms: [], _count: { vms: 0, sessions: 0, apiKeys: 0, sshKeys: 0 } };
      }),
      findUserBasic: jest.fn(async (id: string) => store.users.get(id) ?? null),
      updateUser: jest.fn(async (id: string, data: any) => {
        const u = store.users.get(id);
        if (!u) throw new NotFoundException();
        Object.assign(u, data);
        return u;
      }),
      findManyUserIds: jest.fn(async () => Array.from(store.users.values()).map((u: any) => ({ id: u.id }))),
      // VMs
      countVms: jest.fn(async () => store.vms.size),
      countVmsByStatus: jest.fn(async (status: string) => {
        return Array.from(store.vms.values()).filter((v: any) => v.status === status).length;
      }),
      findRecentVms: jest.fn(async () => []),
      findVmById: jest.fn(async (id: string) => store.vms.get(id) ?? null),
      findVmWithDetails: jest.fn(async (id: string) => store.vms.get(id) ?? null),
      findVms: jest.fn(async (skip: number, take: number) => {
        const vms = Array.from(store.vms.values());
        vms.sort((a: any, b: any) => b.createdAt - a.createdAt);
        return vms.slice(skip || 0, (skip || 0) + (take || 50)).map((v: any) => ({ ...v, user: store.users.get(v.userId) ?? { email: 'unknown', name: null } }));
      }),
      updateVm: jest.fn(async (id: string, data: any) => {
        const v = store.vms.get(id);
        if (!v) throw new NotFoundException();
        Object.assign(v, data);
        return v;
      }),
      deleteVm: jest.fn(async (id: string) => { store.vms.delete(id); }),
      // Nodes
      countNodes: jest.fn(async () => store.nodes.size),
      findNodes: jest.fn(async () => Array.from(store.nodes.values()).map((n: any) => ({ ...n, inventory: null, storagePools: [] }))),
      findNodeById: jest.fn(async (id: string) => {
        const n = store.nodes.get(id);
        if (!n) return null;
        return { ...n, inventory: null, storagePools: [], vms: [] };
      }),
      findNodeByProxmoxId: jest.fn(async (proxmoxNodeId: string) => {
        for (const n of store.nodes.values()) {
          if ((n as any).proxmoxNodeId === proxmoxNodeId) return { ...n, inventory: null, storagePools: [], vms: [] };
        }
        return null;
      }),
      findFirstActiveNode: jest.fn(async () => null),
      createNode: jest.fn(async (data: any) => {
        const n = { id: `n-${store.nodes.size + 1}`, ...data, isActive: true, createdAt: new Date(), updatedAt: new Date() };
        store.nodes.set(n.id, n);
        return n;
      }),
      updateNode: jest.fn(async (id: string, data: any) => {
        const n = store.nodes.get(id);
        if (!n) throw new NotFoundException();
        Object.assign(n, data);
        return n;
      }),
      // Wallets
      countWallets: jest.fn(async () => store.wallets.size),
      aggregateWalletBalance: jest.fn(async () => {
        let total = 0;
        for (const w of store.wallets.values()) total += (w as any).balance;
        return { _sum: { balance: total } };
      }),
      upsertWallet: jest.fn(async (userId: string, create: any, update: any) => {
        const existing = store.wallets.get(userId);
        if (existing) {
          existing.balance += (update.balance as any).increment || 0;
          return existing;
        }
        const w = { id: `w-${userId}`, ...create };
        store.wallets.set(userId, w);
        return w;
      }),
      // Transactions
      createTransaction: jest.fn(async (data: any) => {
        const t = { id: `tx-${store.transactions.size + 1}`, ...data };
        store.transactions.set(t.id, t);
        return t;
      }),
      // Settings
      findSettings: jest.fn(async () => Array.from(store.settings.values())),
      findSettingByKey: jest.fn(async (key: string) => store.settings.get(key) ?? null),
      upsertSetting: jest.fn(async (key: string, value: string) => {
        const existing = store.settings.get(key);
        if (existing) { existing.value = value; return existing; }
        const s = { id: `s-${store.settings.size + 1}`, key, value };
        store.settings.set(key, s);
        return s;
      }),
      deleteSetting: jest.fn(async (key: string) => { store.settings.delete(key); }),
      findSettingsByPrefix: jest.fn(async (prefix: string) => {
        return Array.from(store.settings.values()).filter((s: any) => s.key.startsWith(prefix));
      }),
      // AuditLog
      findAuditLogs: jest.fn(async (skip: number, take: number) => {
        const logs = Array.from(store.auditLogs.values());
        logs.sort((a: any, b: any) => b.createdAt - a.createdAt);
        return logs.slice(skip || 0, (skip || 0) + (take || 100)).map((l: any) => ({
          ...l, user: store.users.get(l.userId) ?? { email: 'unknown', name: null },
        }));
      }),
      countAuditLogs: jest.fn(async () => store.auditLogs.size),
      // Roles
      findRoleByName: jest.fn(async (name: string) => {
        for (const r of store.roles.values()) {
          if ((r as any).name === name) return r;
        }
        return null;
      }),
      findRoleById: jest.fn(async (id: string) => {
        for (const r of store.roles.values()) {
          if ((r as any).id === id) return r;
        }
        return null;
      }),
      findRoles: jest.fn(async () => Array.from(store.roles.values()).map((r: any) => ({
        ...r, permissions: [], _count: { users: 0 },
      }))),
      createRole: jest.fn(async (data: any) => {
        const r = { id: `r-${store.roles.size + 1}`, ...data };
        store.roles.set(r.name, r);
        return r;
      }),
      upsertRole: jest.fn(async (where: any, create: any) => {
        const name = where.name;
        const existing = store.roles.get(name);
        if (existing) { Object.assign(existing, {}); return existing; }
        const r = { id: `r-${store.roles.size + 1}`, ...create };
        store.roles.set(r.name, r);
        return r;
      }),
      updateRole: jest.fn(async (id: string, data: any) => {
        for (const r of store.roles.values()) {
          if ((r as any).id === id) { Object.assign(r, data); return r; }
        }
        throw new NotFoundException();
      }),
      deleteRole: jest.fn(async (id: string) => {
        for (const [name, r] of store.roles) {
          if ((r as any).id === id) { store.roles.delete(name); return; }
        }
      }),
      findRoleWithPermissions: jest.fn(async (id: string) => {
        for (const r of store.roles.values()) {
          if ((r as any).id === id) return { ...r, permissions: [], _count: { users: 0 } };
        }
        return null;
      }),
      // UserRole
      findUserRole: jest.fn(async (userId: string, roleId: string) => {
        for (const ur of store.userRoles.values()) {
          if ((ur as any).userId === userId && (ur as any).roleId === roleId) return ur;
        }
        return null;
      }),
      createUserRole: jest.fn(async (data: any) => {
        const ur = { id: `ur-${store.userRoles.size + 1}`, ...data };
        store.userRoles.set(ur.id, ur);
        return ur;
      }),
      deleteUserRoles: jest.fn(async (userId: string, roleId: string) => {
        const toDelete: string[] = [];
        for (const [id, ur] of store.userRoles) {
          if ((ur as any).userId === userId && (ur as any).roleId === roleId) toDelete.push(id);
        }
        for (const id of toDelete) store.userRoles.delete(id);
        return { count: toDelete.length };
      }),
      // ResourcePool / Allocation
      findPoolById: jest.fn(),
      findPoolByUser: jest.fn(),
      findResourceAllocationByVm: jest.fn(async (vmId: string) => store.allocations.get(vmId) ?? null),
      findResourceAllocationsByPool: jest.fn(),
      // Templates
      findTemplateById: jest.fn(),
      findTemplates: jest.fn(),
      countTemplates: jest.fn(),
      findActiveTemplates: jest.fn(),
      findAllTemplates: jest.fn(),
      createTemplate: jest.fn(),
      updateTemplate: jest.fn(),
      deleteTemplate: jest.fn(),
      // Permissions
      findPermissions: jest.fn(),
      findPermissionById: jest.fn(),
      // RolePermission
      findRolePermission: jest.fn(),
      upsertRolePermission: jest.fn(),
      deleteRolePermission: jest.fn(),
      // SupportTicket
      findTickets: jest.fn(),
      findTicketById: jest.fn(),
      findTicketWithMessages: jest.fn(),
      createTicketMessage: jest.fn(),
      updateTicket: jest.fn(),
      // Notifications
      createNotification: jest.fn(),
      createManyNotifications: jest.fn(),
    };

    mockPrisma = {
      auditLog: {
        create: jest.fn(({ data }: any) => {
          const log = { id: `log-${store.auditLogs.size + 1}`, ...data };
          store.auditLogs.set(log.id, log);
          return log;
        }),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: AdminRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProxmoxService, useValue: { refreshConfig: jest.fn() } },
        { provide: ProxmoxJobService, useValue: { enqueueJob: jest.fn().mockResolvedValue({ status: 'queued' }) } },
        { provide: ResourcePoolService, useValue: { releaseResources: jest.fn().mockResolvedValue({ success: true }) } },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('test-impersonation-token') } },
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
    it('updates user fields and writes audit log', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com', name: 'Alice', isActive: true });

      const updated = await service.updateUser('admin-1', 'u-1', { name: 'Updated' });
      expect(updated.name).toBe('Updated');
      expect(store.auditLogs.size).toBe(1);
      const log = Array.from(store.auditLogs.values())[0];
      expect((log as any).action).toBe('admin.user.update');
    });
  });

  describe('deactivateUser', () => {
    it('deactivates and writes audit log', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com', isActive: true });
      await service.deactivateUser('admin-1', 'u-1');
      expect(store.users.get('u-1').isActive).toBe(false);
      expect(store.auditLogs.size).toBe(1);
    });
  });

  describe('activateUser', () => {
    it('activates and writes audit log', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com', isActive: false });
      await service.activateUser('admin-1', 'u-1');
      expect(store.users.get('u-1').isActive).toBe(true);
      expect(store.auditLogs.size).toBe(1);
    });
  });

  describe('forceStopVm', () => {
    it('stops VM and writes audit log', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'u-1', name: 'test', status: 'running' });
      const result = await service.forceStopVm('admin-1', 'vm-1');
      expect(result.message).toContain('force-stopped');
      expect(store.vms.get('vm-1').status).toBe('stopped');
      expect(store.auditLogs.size).toBe(1);
    });
  });

  describe('forceDeleteVm', () => {
    it('deletes VM, releases resources, and writes audit log', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'u-1', name: 'test', status: 'running' });
      const result = await service.forceDeleteVm('admin-1', 'vm-1');
      expect(result.message).toContain('force-deleted');
      expect(store.vms.has('vm-1')).toBe(false);
      expect(store.auditLogs.size).toBe(1);
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

    it('sets and updates a setting with audit log', async () => {
      await service.setSetting('site_name', 'CloudNest');
      expect(store.settings.get('site_name').value).toBe('CloudNest');
      expect(store.auditLogs.size).toBe(1);
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
    it('creates a node with audit log', async () => {
      const node = await service.createNode('admin-1', {
        proxmoxNodeId: 'pve', name: 'Main Node', host: '172.16.1.10', port: 8006,
      });
      expect(node.name).toBe('Main Node');
      expect(store.auditLogs.size).toBe(1);

      const nodes = await service.listNodes();
      expect(nodes).toHaveLength(1);
    });

    it('rejects duplicate proxmoxNodeId', async () => {
      store.nodes.set('n-1', { id: 'n-1', proxmoxNodeId: 'pve', name: 'Existing', host: '10.0.0.1' });
      await expect(service.createNode('admin-1', {
        proxmoxNodeId: 'pve', name: 'Duplicate', host: '10.0.0.2',
      })).rejects.toThrow(BadRequestException);
    });

    it('updates a node with audit log', async () => {
      store.nodes.set('n-1', { id: 'n-1', proxmoxNodeId: 'pve', name: 'Old', host: '10.0.0.1' });
      await service.updateNode('admin-1', 'n-1', { name: 'New' });
      expect(store.nodes.get('n-1').name).toBe('New');
      expect(store.auditLogs.size).toBe(1);
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
    it('assigns role with audit log', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com' });
      await service.assignRole('admin-1', 'u-1', 'admin');
      expect(store.roles.has('admin')).toBe(true);
      expect(store.userRoles.size).toBe(1);
      expect(store.auditLogs.size).toBe(1);
    });

    it('removes a role from user with audit log', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com' });
      store.roles.set('admin', { id: 'role-admin', name: 'admin' });
      const role = store.roles.get('admin');
      store.userRoles.set('ur-1', { id: 'ur-1', userId: 'u-1', roleId: role.id });
      await service.removeRole('admin-1', 'u-1', 'admin');
      expect(store.userRoles.size).toBe(0);
      expect(store.auditLogs.size).toBe(1);
    });
  });

  describe('creditUserWallet', () => {
    it('credits wallet and writes audit log', async () => {
      store.users.set('u-1', { id: 'u-1', email: 'a@b.com' });
      const wallet = await service.creditUserWallet('admin-1', 'u-1', 5000);
      expect(wallet.balance).toBe(5000);
      expect(store.auditLogs.size).toBe(1);
    });
  });
});
