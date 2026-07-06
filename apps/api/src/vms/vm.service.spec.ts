import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VmService } from './vm.service';
import { VmRepository } from './vm.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../wallet/wallet.service';

describe('VmService', () => {
  let service: VmService;
  let mockRepo: any;
  let mockPrisma: any;
  let mockJobService: any;
  let mockPoolService: any;
  let mockProxmoxService: any;
  let mockSubsService: any;
  let mockConfigService: any;
  let mockWalletService: any;

  const store: Record<string, any> = {
    vms: new Map<string, any>(),
    allocations: new Map<string, any>(),
    auditLogs: new Map<string, any>(),
    pools: new Map<string, any>(),
    templates: new Map<string, any>(),
    nodes: new Map<string, any>(),
    otherUsage: { cores: 0, memoryMb: 0, diskGb: 0, ips: 0 },
    backups: new Map(),
    snapshots: new Map(),
  };

  const addPool = (data: any) => {
    const pool = { id: `pool-${store.pools.size + 1}`, userId: 'user-1', totalCores: 8, totalMemoryMb: 16384, totalDiskGb: 200, totalIps: 5, backupEnabled: false, createdAt: new Date(), updatedAt: new Date(), ...data };
    store.pools.set(pool.id, pool);
    return pool;
  };

  const addTemplate = (data: any) => {
    const tmpl = { id: `tmpl-${store.templates.size + 1}`, name: 'Ubuntu 24.04', proxmoxTemplateId: '100', osType: 'linux', minDiskGb: 5, minMemoryMb: 512, isActive: true, createdAt: new Date(), ...data };
    store.templates.set(tmpl.id, tmpl);
    return tmpl;
  };

  const addNode = (data: any = {}) => {
    const node = { id: `node-1`, name: 'r730xd', proxmoxNodeId: 'r730xd', host: '172.16.1.10', port: 8006, isActive: true, createdAt: new Date(), updatedAt: new Date(), ...data };
    store.nodes.set(node.id, node);
    return node;
  };

  beforeEach(async () => {
    store.vms.clear();
    store.allocations.clear();
    store.auditLogs.clear();
    store.pools.clear();
    store.templates.clear();
    store.nodes.clear();
    store.backups = new Map();
    store.snapshots = new Map();
    store.otherUsage = { cores: 0, memoryMb: 0, diskGb: 0, ips: 0 };

    mockJobService = {
      enqueueJob: jest.fn().mockResolvedValue({ idempotencyKey: 'ik-1', status: 'queued' }),
    };

    mockPoolService = {
      getPoolAvailable: jest.fn().mockResolvedValue({ cores: 10, memoryMb: 20000, diskGb: 500, ips: 5 }),
      allocateResources: jest.fn().mockResolvedValue({ success: true, message: 'allocated' }),
    };

    mockSubsService = {
      countActiveByUser: jest.fn().mockResolvedValue(1),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    mockWalletService = {
      getBalance: jest.fn().mockResolvedValue(10000),
      getOrCreateWallet: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'user-1', balance: 10000 }),
    };

    mockProxmoxService = {
      getVncTicket: jest.fn().mockResolvedValue({ ticket: 'vnctoken123', port: '5900', cert: 'testcert' }),
      getNextVmid: jest.fn().mockResolvedValue(100),
      downloadUrl: jest.fn().mockResolvedValue({ task: 'UPID:test-task' }),
      addFirewallRule: jest.fn().mockResolvedValue({}),
      deleteFirewallRule: jest.fn().mockResolvedValue({}),
      updateVmConfig: jest.fn().mockResolvedValue({}),
      getStoragePools: jest.fn().mockResolvedValue([]),
      getStorageContent: jest.fn().mockResolvedValue([]),
      getFirewallRules: jest.fn().mockResolvedValue([]),
      getVmConfig: jest.fn().mockResolvedValue({}),
      getCurrentIso: jest.fn().mockResolvedValue(null),
      getVmRrdData: jest.fn().mockResolvedValue({}),
    };

    const mockTx = {
      $queryRawUnsafe: jest.fn((sql: string, ...params: any[]) => {
        if (sql.includes('FOR UPDATE')) {
          let poolId = 'pool-1';
          for (const p of store.pools.values()) {
            poolId = p.id;
            break;
          }
          const pool = store.pools.get(poolId)!;
          return [{ id: pool.id, totalCores: pool.totalCores, totalMemoryMb: pool.totalMemoryMb, totalDiskGb: pool.totalDiskGb, totalIps: pool.totalIps }];
        }
        if (sql.includes('"vmId" != $2')) {
          return [{ cores: store.otherUsage.cores, memoryMb: store.otherUsage.memoryMb, diskGb: store.otherUsage.diskGb, ips: store.otherUsage.ips }];
        }
        if (sql.includes('"vmId" = $1')) {
          for (const alloc of store.allocations.values()) {
            if ((alloc as any).vmId === params[0]) {
              return [{ cores: alloc.cores, memoryMb: alloc.memoryMb, diskGb: alloc.diskGb }];
            }
          }
          return [];
        }
        return [];
      }),
      auditLog: {
        create: jest.fn(({ data }: any) => {
          const log = { id: `log-${store.auditLogs.size + 1}`, ...data };
          store.auditLogs.set(log.id, log);
          return log;
        }),
      },
    };

    mockRepo = {
      // VM
      findUserById: jest.fn(async (userId: string) => {
        return { id: userId, isActive: true };
      }),
      countVmsByUser: jest.fn(async (_userId: string) => store.vms.size),
      findVmById: jest.fn(async (id: string) => store.vms.get(id) ?? null),
      findVmWithSubscription: jest.fn(async (id: string) => {
        const vm = store.vms.get(id) ?? null;
        if (vm) vm.subscription = { backupLimit: 5, snapshotLimit: 5 };
        return vm;
      }),
      findVmsByUser: jest.fn(async (userId: string) => {
        return Array.from(store.vms.values()).filter((v: any) => v.userId === userId);
      }),
      createVm: jest.fn(async (data: any) => {
        const vm = { id: `vm-${store.vms.size + 1}`, status: 'provisioning', proxmoxId: null, nodeId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.vms.set(vm.id, vm);
        return vm;
      }),
      updateVm: jest.fn(async (id: string, data: any) => {
        const vm = store.vms.get(id);
        if (!vm) throw new Error('Not found');
        Object.assign(vm, data);
        return vm;
      }),
      // Templates
      findActiveTemplates: jest.fn(async () => {
        return Array.from(store.templates.values()).filter((t: any) => t.isActive);
      }),
      findTemplateById: jest.fn(async (id: string) => store.templates.get(id) ?? null),
      // Pools
      findPoolById: jest.fn(async (id: string) => store.pools.get(id) ?? null),
      // Nodes
      findFirstActiveNode: jest.fn(async () => {
        if (!store.nodes || store.nodes.size === 0) return null;
        const first = store.nodes.values().next().value;
        return first ?? null;
      }),
      findNodeById: jest.fn(async (id: string) => store.nodes.get(id) ?? null),
      // IPs
      findAvailableIp: jest.fn(async () => null),
      assignIpToVm: jest.fn(async (ipId: string, vmId: string) => ({ id: ipId, isAssigned: true, vmId })),
      // Raw queries for resize — access store directly like original mockTx did
      lockUserPools: jest.fn(async (_userId: string, _tx?: any) => {
        let poolId = 'pool-1';
        for (const p of store.pools.values()) {
          poolId = p.id;
          break;
        }
        const pool = store.pools.get(poolId)!;
        return [{ id: pool.id, totalCores: pool.totalCores, totalMemoryMb: pool.totalMemoryMb, totalDiskGb: pool.totalDiskGb, totalIps: pool.totalIps }];
      }),
      sumAllocationsExcludingVm: jest.fn(async (_poolId: string, _vmId: string, _tx?: any) => {
        return [{ cores: store.otherUsage.cores, memoryMb: store.otherUsage.memoryMb, diskGb: store.otherUsage.diskGb, ips: store.otherUsage.ips }];
      }),
      findAllocationByVm: jest.fn(async (vmId: string, _tx?: any) => {
        for (const alloc of store.allocations.values()) {
          if ((alloc as any).vmId === vmId) {
            return [{ cores: alloc.cores, memoryMb: alloc.memoryMb, diskGb: alloc.diskGb }];
          }
        }
        return [];
      }),
      // Backups
      findBackupsByVm: jest.fn(async (vmId: string) => {
        return Array.from(store.backups.values()).filter((b: any) => b.vmId === vmId);
      }),
      findCompletedBackupsByVm: jest.fn(async (vmId: string) => {
        return Array.from(store.backups.values()).filter((b: any) => b.vmId === vmId && b.status === 'completed');
      }),
      findBackupById: jest.fn(async (id: string) => {
        for (const b of store.backups?.values() ?? []) {
          if ((b as any).id === id) return b;
        }
        return null;
      }),
      createBackup: jest.fn(async (data: any) => {
        const b = { id: `bkp-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        if (!store.backups) store.backups = new Map();
        store.backups.set(b.id, b);
        return b;
      }),
      updateBackup: jest.fn(async (id: string, data: any) => {
        for (const b of store.backups?.values() ?? []) {
          if ((b as any).id === id) { Object.assign(b, data); return b; }
        }
        return null;
      }),
      // Snapshots
      findSnapshotsByVm: jest.fn(async (vmId: string) => {
        return Array.from(store.snapshots.values()).filter((s: any) => s.vmId === vmId);
      }),
      findSnapshotById: jest.fn(async (id: string) => {
        for (const s of store.snapshots?.values() ?? []) {
          if ((s as any).id === id) return s;
        }
        return null;
      }),
      createSnapshot: jest.fn(async (data: any) => {
        const s = { id: `snap-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        if (!store.snapshots) store.snapshots = new Map();
        store.snapshots.set(s.id, s);
        return s;
      }),
      updateSnapshot: jest.fn(async (id: string, data: any) => {
        for (const s of store.snapshots?.values() ?? []) {
          if ((s as any).id === id) { Object.assign(s, data); return s; }
        }
        return null;
      }),
    };

    mockPrisma = {
      auditLog: {
        create: jest.fn(({ data }: any) => {
          const log = { id: `log-${store.auditLogs.size + 1}`, ...data };
          store.auditLogs.set(log.id, log);
          return log;
        }),
      },
      $transaction: jest.fn((fn: any) => fn(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VmService,
        { provide: VmRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProxmoxJobService, useValue: mockJobService },
        { provide: ResourcePoolService, useValue: mockPoolService },
        { provide: ProxmoxService, useValue: mockProxmoxService },
        { provide: SubscriptionsService, useValue: mockSubsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WalletService, useValue: mockWalletService },
      ],
    }).compile();

    service = module.get<VmService>(VmService);
  });

  describe('createVm', () => {
    it('creates a VM and enqueues provision job', async () => {
      const pool = addPool({ userId: 'user-1' });
      const template = addTemplate({});
      addNode();

      const vm = await service.createVm('user-1', {
        name: 'my-vm',
        poolId: pool.id,
        templateId: template.id,
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });

      expect(vm.name).toBe('my-vm');
      expect(vm.status).toBe('provisioning');
      expect(vm.userId).toBe('user-1');
      expect(mockPoolService.allocateResources).toHaveBeenCalledWith(
        expect.objectContaining({ poolId: pool.id, cores: 2, memoryMb: 4096, diskGb: 50 }),
        expect.anything(),
      );
      expect(store.auditLogs.size).toBe(1);
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'create-vm',
        expect.objectContaining({ vmId: vm.id, name: 'my-vm' }),
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('rejects creation with non-existent pool', async () => {
      await expect(service.createVm('user-1', {
        name: 'vm',
        poolId: 'nonexistent',
        templateId: 'tmpl-1',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 10,
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects creation with another user pool', async () => {
      const pool = addPool({ userId: 'other-user' });
      const template = addTemplate({});

      await expect(service.createVm('user-1', {
        name: 'vm',
        poolId: pool.id,
        templateId: template.id,
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 10,
      })).rejects.toThrow(ForbiddenException);
    });

    it('rejects creation with non-existent template', async () => {
      const pool = addPool({ userId: 'user-1' });

      await expect(service.createVm('user-1', {
        name: 'vm',
        poolId: pool.id,
        templateId: 'nonexistent',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 10,
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects VM creation when wallet balance is below hourly cost', async () => {
      const pool = addPool({ userId: 'user-1' });
      const template = addTemplate({});
      addNode();

      mockWalletService.getBalance.mockResolvedValueOnce(50);

      await expect(service.createVm('user-1', {
        name: 'low-balance-vm',
        poolId: pool.id,
        templateId: template.id,
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 50,
      })).rejects.toThrow(BadRequestException);

      expect(store.vms.size).toBe(0);
      expect(mockPoolService.allocateResources).not.toHaveBeenCalled();
    });

    it('passes balance check when wallet has exactly the hourly cost', async () => {
      const pool = addPool({ userId: 'user-1' });
      const template = addTemplate({});
      addNode();

      mockWalletService.getBalance.mockResolvedValueOnce(240);

      await service.createVm('user-1', {
        name: 'exact-balance-vm',
        poolId: pool.id,
        templateId: template.id,
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });

      const vm = store.vms.get('vm-1');
      expect(vm.status).toBe('provisioning');
    });
  });

  describe('listVms / getVm', () => {
    it('lists VMs for a user', async () => {
      addPool({ userId: 'user-1' });

      // Manually add VMs
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });
      store.vms.set('vm-2', { id: 'vm-2', userId: 'user-1', name: 'vm2', status: 'stopped', cpuCores: 2, memoryMb: 2048, diskGb: 20, createdAt: new Date(), updatedAt: new Date() });

      const vms = await service.listVms('user-1');
      expect(vms).toHaveLength(2);
    });

    it('gets a specific VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const vm = await service.getVm('vm-1', 'user-1');
      expect(vm.name).toBe('vm1');
    });

    it('rejects access to another user VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'other', name: 'vm1', status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.getVm('vm-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for non-existent VM', async () => {
      await expect(service.getVm('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('performAction', () => {
    it('starts a stopped VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.performAction('user-1', 'vm-1', 'start');
      expect(result.message).toBe('start command queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'start-vm',
        expect.any(Object),
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('stops a running VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.performAction('user-1', 'vm-1', 'stop');
      expect(result.message).toBe('stop command queued');
    });

    it('rejects starting an already running VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.performAction('user-1', 'vm-1', 'start')).rejects.toThrow(BadRequestException);
    });

    it('rejects action on provisioning VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'provisioning', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.performAction('user-1', 'vm-1', 'start')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteVm', () => {
    it('queues deletion of a stopped VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.deleteVm('user-1', 'vm-1');
      expect(result.message).toBe('Delete command queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith('delete-vm', expect.any(Object), expect.any(Object));
    });

    it('rejects deletion of provisioning VM', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'provisioning', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.deleteVm('user-1', 'vm-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resizeVm', () => {
    it('resizes a VM and updates allocation', async () => {
      const pool = addPool({ userId: 'user-1' });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', cpuCores: 2, memoryMb: 4096, diskGb: 50, createdAt: new Date(), updatedAt: new Date() });
      store.allocations.set('alloc-1', { id: 'alloc-1', poolId: pool.id, vmId: 'vm-1', cores: 2, memoryMb: 4096, diskGb: 50, ips: 0 });

      const updated = await service.resizeVm('user-1', 'vm-1', { cpuCores: 4, memoryMb: 8192 });
      expect(updated.message).toBe('Resize queued');
      expect(updated.vmId).toBe('vm-1');
      // Audit log is created by the consumer after job completes, not here
      expect(store.auditLogs.size).toBe(0);
    });

    it('rejects resize that would exceed pool limits', async () => {
      store.otherUsage = { cores: 8, memoryMb: 16000, diskGb: 190, ips: 5 };
      const pool = addPool({ userId: 'user-1' });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });
      store.allocations.set('alloc-1', { id: 'alloc-1', poolId: pool.id, vmId: 'vm-1', cores: 1, memoryMb: 1024, diskGb: 10, ips: 0 });

      await expect(service.resizeVm('user-1', 'vm-1', { cpuCores: 4 })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('downloadUrlIso', () => {
    it('enqueues download-url job via BullMQ with idempotency, defers audit log to consumer', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.downloadUrlIso('user-1', 'vm-1', 'http://example.com/test.iso', 'local');

      expect(result.message).toBe('ISO download queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'download-url',
        expect.objectContaining({ vmId: 'vm-1', url: 'http://example.com/test.iso', storage: 'local', dlNode: 'r730xd' }),
        expect.objectContaining({ userId: 'user-1', auditLog: expect.objectContaining({ action: 'vm.iso.download-url' }) }),
      );
      // Audit log is deferred to consumer, not written here
      expect(store.auditLogs.size).toBe(0);
      expect(mockProxmoxService.downloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('addFirewallRule / deleteFirewallRule', () => {
    it('enqueues add-firewall-rule job via BullMQ', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const rule = { action: 'ACCEPT', source: '1.2.3.4' };
      const result = await service.addFirewallRule('user-1', 'vm-1', rule);

      expect(result.message).toBe('Firewall rule queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'add-firewall-rule',
        expect.objectContaining({ vmId: 'vm-1', vmid: 100, fwNode: 'r730xd', rule }),
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(mockProxmoxService.addFirewallRule).not.toHaveBeenCalled();
      expect(store.auditLogs.size).toBe(0);
    });

    it('enqueues delete-firewall-rule job via BullMQ', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.deleteFirewallRule('user-1', 'vm-1', 3);

      expect(result.message).toBe('Firewall rule delete queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'delete-firewall-rule',
        expect.objectContaining({ vmId: 'vm-1', vmid: 100, pos: 3 }),
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(mockProxmoxService.deleteFirewallRule).not.toHaveBeenCalled();
    });

    it('throws when VM has no proxmoxId for firewall rule', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: null, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.addFirewallRule('user-1', 'vm-1', {})).rejects.toThrow(BadRequestException);
      expect(mockJobService.enqueueJob).not.toHaveBeenCalled();
    });
  });

  describe('updateHardwareConfig', () => {
    it('enqueues update-vm-config job via BullMQ', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.updateHardwareConfig('user-1', 'vm-1', { cpu: 'host', sockets: 2 });

      expect(result.message).toContain('queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'update-vm-config',
        expect.objectContaining({ vmId: 'vm-1', vmid: 100, config: { cpu: 'host', sockets: 2 }, node: 'r730xd' }),
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(mockProxmoxService.updateVmConfig).not.toHaveBeenCalled();
      expect(store.auditLogs.size).toBe(0);
    });

    it('rejects when VM is not stopped', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.updateHardwareConfig('user-1', 'vm-1', { cpu: 'host' })).rejects.toThrow(BadRequestException);
      expect(mockJobService.enqueueJob).not.toHaveBeenCalled();
    });

    it('rejects when no valid hardware keys are provided', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.updateHardwareConfig('user-1', 'vm-1', { unknown: 'xyz' })).rejects.toThrow(BadRequestException);
      expect(mockJobService.enqueueJob).not.toHaveBeenCalled();
    });
  });

  describe('setNetworkInterface / deleteNetworkInterface', () => {
    it('setNetworkInterface enqueues update-vm-config job', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.setNetworkInterface('user-1', 'vm-1', 'net0', 'virtio=00:11:22:33:44:55,bridge=vmbr0');

      expect(result.message).toContain('queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'update-vm-config',
        expect.objectContaining({ vmId: 'vm-1', vmid: 100, config: { net0: 'virtio=00:11:22:33:44:55,bridge=vmbr0' }, node: 'r730xd' }),
        expect.anything(),
      );
      expect(mockProxmoxService.updateVmConfig).not.toHaveBeenCalled();
      expect(store.auditLogs.size).toBe(0);
    });

    it('deleteNetworkInterface enqueues update-vm-config with delete directive', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.deleteNetworkInterface('user-1', 'vm-1', 'net1');

      expect(result.message).toContain('queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'update-vm-config',
        expect.objectContaining({ vmId: 'vm-1', vmid: 100, config: { net1: 'delete' }, node: 'r730xd' }),
        expect.anything(),
      );
      expect(mockProxmoxService.updateVmConfig).not.toHaveBeenCalled();
    });

    it('rejects invalid network key format', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.setNetworkInterface('user-1', 'vm-1', 'invalid', 'value')).rejects.toThrow(BadRequestException);
    });

    it('requires VM to be stopped', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.setNetworkInterface('user-1', 'vm-1', 'net0', 'virtio=...')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reinstallVm', () => {
    it('sets status to provisioning inside transaction with audit log, then enqueues job', async () => {
      const template = addTemplate({});
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.reinstallVm('user-1', 'vm-1', template.id);

      expect(result.message).toBe('Reinstall queued');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      const vm = store.vms.get('vm-1');
      expect(vm.status).toBe('provisioning');
      expect(store.auditLogs.size).toBe(1);
      expect((Array.from(store.auditLogs.values()) as any[])[0].action).toBe('vm.reinstall.status');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'reinstall-vm',
        expect.objectContaining({ vmId: 'vm-1', proxmoxId: 100 }),
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws when template does not exist', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'stopped', proxmoxId: 100, cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      await expect(service.reinstallVm('user-1', 'vm-1', 'nonexistent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resizeVm — TOCTOU characterization', () => {
    it('does NOT update ResourceAllocation during the pool check transaction', async () => {
      const pool = addPool({ userId: 'user-1' });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, cpuCores: 2, memoryMb: 4096, diskGb: 50, createdAt: new Date(), updatedAt: new Date() });
      store.allocations.set('alloc-1', { id: 'alloc-1', poolId: pool.id, vmId: 'vm-1', cores: 2, memoryMb: 4096, diskGb: 50, ips: 0 });

      await service.resizeVm('user-1', 'vm-1', { cpuCores: 4, memoryMb: 8192 });

      // CHARACTERIZES: allocation was NOT updated (still has old values)
      const alloc = store.allocations.get('alloc-1');
      expect(alloc.cores).toBe(2);
      expect(alloc.memoryMb).toBe(4096);
      expect(alloc.diskGb).toBe(50);
      // CHARACTERIZES: VM was NOT updated (still has old values)
      const vm = store.vms.get('vm-1');
      expect(vm.cpuCores).toBe(2);
      expect(vm.memoryMb).toBe(4096);
      // CHARACTERIZES: no audit log written (deferred to consumer)
      expect(store.auditLogs.size).toBe(0);
      // CHARACTERIZES: enqueued resize-vm job with new values
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'resize-vm',
        expect.objectContaining({ cores: 4, memory: 8192, disk: 50 }),
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('rejects when requesting more resources than available in pool', async () => {
      store.otherUsage = { cores: 8, memoryMb: 16000, diskGb: 190, ips: 5 };
      const pool = addPool({ userId: 'user-1', totalCores: 8, totalMemoryMb: 16384, totalDiskGb: 200 });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });
      store.allocations.set('alloc-1', { id: 'alloc-1', poolId: pool.id, vmId: 'vm-1', cores: 1, memoryMb: 1024, diskGb: 10, ips: 0 });

      await expect(service.resizeVm('user-1', 'vm-1', { cpuCores: 4 })).rejects.toThrow(ForbiddenException);
    });

    it('rejects when resize would exceed pool disk limits', async () => {
      store.otherUsage = { cores: 2, memoryMb: 4000, diskGb: 195, ips: 5 };
      const pool = addPool({ userId: 'user-1', totalCores: 8, totalMemoryMb: 16384, totalDiskGb: 200 });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });
      store.allocations.set('alloc-1', { id: 'alloc-1', poolId: pool.id, vmId: 'vm-1', cores: 1, memoryMb: 1024, diskGb: 10, ips: 0 });

      await expect(service.resizeVm('user-1', 'vm-1', { diskGb: 20 })).rejects.toThrow(ForbiddenException);
    });

    it('allows resize with only disk change when pool has capacity', async () => {
      const pool = addPool({ userId: 'user-1', totalCores: 8, totalMemoryMb: 16384, totalDiskGb: 200 });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });
      store.allocations.set('alloc-1', { id: 'alloc-1', poolId: pool.id, vmId: 'vm-1', cores: 1, memoryMb: 1024, diskGb: 10, ips: 0 });

      const result = await service.resizeVm('user-1', 'vm-1', { diskGb: 30 });

      expect(result.message).toBe('Resize queued');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'resize-vm',
        expect.objectContaining({ disk: 30 }),
        expect.anything(),
      );
    });

    it('throws when VM has no resource allocation', async () => {
      addPool({ userId: 'user-1' });
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });
      // No allocation set

      await expect(service.resizeVm('user-1', 'vm-1', { cpuCores: 2 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getVncUrl', () => {
    it('returns VNC connection info and writes audit log inside transaction', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.getVncUrl('user-1', 'vm-1');
      expect(result.host).toBeTruthy();
      expect(result.port).toBe('5900');
      expect(result.ticket).toBeTruthy();
      expect(store.auditLogs.size).toBe(1);
      const log = Array.from(store.auditLogs.values())[0] as any;
      expect(log.action).toBe('vm.console');
      // FIXED: audit log written inside $transaction
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // --- Characterization: Bucket 1 — non-compliant audit logs ---

  describe('setDnsConfig — audit log characterization', () => {
    it('updates DNS and writes audit log inside transaction', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', nameserver1: null, nameserver2: null, searchdomain: null, status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.setDnsConfig('user-1', 'vm-1', { nameserver1: '8.8.8.8' });

      expect(result.nameserver1).toBe('8.8.8.8');
      expect(store.auditLogs.size).toBe(1);
      expect((Array.from(store.auditLogs.values()) as any[])[0].action).toBe('vm.dns.update');
      // FIXED: audit log written inside $transaction
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('createBackup — audit log characterization', () => {
    it('creates backup record, enqueues backup-vm job, and does NOT write audit log directly (deferred to consumer)', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.createBackup('user-1', 'vm-1', {});

      expect(result.status).toBe('pending');
      expect(result.vmId).toBe('vm-1');
      // CHARACTERIZES: primary audit log is deferred to consumer via enqueueJob
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'backup-vm',
        expect.objectContaining({ vmId: 'vm-1', backupId: result.id }),
        expect.objectContaining({ userId: 'user-1', auditLog: expect.objectContaining({ action: 'vm.backup.create' }) }),
      );
      // CHARACTERIZES: no direct audit log write for the create action
      expect(store.auditLogs.size).toBe(0);
    });

    it('retention-evict: writes audit log inside transaction when 5+ completed backups exist', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      // Override findCompletedBackupsByVm to simulate 5 completed backups for retention eviction
      const completedBackups = Array.from({ length: 5 }, (_, i) => ({
        id: `old-bkp-${i}`,
        vmId: 'vm-1',
        status: 'completed',
        createdAt: new Date(Date.now() - (5 - i) * 86400000),
      }));
      const origFindCompleted = mockRepo.findCompletedBackupsByVm;
      mockRepo.findCompletedBackupsByVm = jest.fn().mockResolvedValue(completedBackups);

      try {
        const result = await service.createBackup('user-1', 'vm-1', {});

        expect(result.status).toBe('pending');
        expect(store.auditLogs.size).toBe(1);
        const log = Array.from(store.auditLogs.values())[0] as any;
        expect(log.action).toBe('vm.backup.retention-evict');
        expect(log.metadata.reason).toBe('FIFO eviction');
        // FIXED: audit log written inside $transaction
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      } finally {
        mockRepo.findCompletedBackupsByVm = origFindCompleted;
      }
    });
  });

  describe('deleteBackup — audit log characterization', () => {
    it('marks backup failed and writes audit log inside transaction', async () => {
      addNode();
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, nodeId: 'node-1', cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });
      if (!store.backups) store.backups = new Map();
      store.backups.set('bkp-1', { id: 'bkp-1', vmId: 'vm-1', status: 'completed', storage: 'local-lvm', name: 'test-backup', createdAt: new Date(), updatedAt: new Date() });

      const result = await service.deleteBackup('user-1', 'vm-1', 'bkp-1');

      expect(result.message).toBe('Backup deleted');
      const bkp = store.backups.get('bkp-1');
      expect(bkp.status).toBe('failed');
      expect(store.auditLogs.size).toBe(1);
      expect((Array.from(store.auditLogs.values()) as any[])[0].action).toBe('vm.backup.delete');
      // FIXED: audit log written inside $transaction
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
