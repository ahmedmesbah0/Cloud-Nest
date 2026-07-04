import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VmService } from './vm.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxService } from '../proxmox/proxmox.service';

describe('VmService', () => {
  let service: VmService;
  let mockPrisma: any;
  let mockJobService: any;
  let mockPoolService: any;

  const store = {
    vms: new Map<string, any>(),
    allocations: new Map<string, any>(),
    auditLogs: new Map<string, any>(),
    pools: new Map<string, any>(),
    templates: new Map<string, any>(),
    nodes: new Map<string, any>(),
    otherUsage: { cores: 0, memoryMb: 0, diskGb: 0, ips: 0 },
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

    mockJobService = {
      enqueueJob: jest.fn().mockResolvedValue({ idempotencyKey: 'ik-1', status: 'queued' }),
    };

    mockPoolService = {
      getPoolAvailable: jest.fn().mockResolvedValue({ cores: 10, memoryMb: 20000, diskGb: 500, ips: 5 }),
      allocateResources: jest.fn().mockResolvedValue({ success: true, message: 'allocated' }),
    };

    const mockProxmoxService = {
      getVncTicket: jest.fn().mockResolvedValue({ ticket: 'vnctoken123', port: '5900', cert: 'testcert' }),
      getNextVmid: jest.fn().mockResolvedValue(100),
    };

    const mockTx = {
      vm: {
        create: jest.fn(({ data }: any) => {
          const vm = { id: `vm-${store.vms.size + 1}`, status: 'provisioning', proxmoxId: null, nodeId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
          store.vms.set(vm.id, vm);
          return vm;
        }),
        update: jest.fn(({ where, data }: any) => {
          const vm = store.vms.get(where.id);
          if (!vm) throw new Error('Not found');
          Object.assign(vm, data);
          return vm;
        }),
      },
      resourceAllocation: {
        update: jest.fn(({ where, data }: any) => {
          for (const [, alloc] of store.allocations) {
            if ((alloc as any).vmId === where.vmId) {
              Object.assign(alloc, data);
              return alloc;
            }
          }
          throw new Error('Allocation not found');
        }),
      },
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
          return [{ cores: 0, memoryMb: 0, diskGb: 0 }];
        }
        return [];
      }),
      ipAddress: {
        findFirst: jest.fn(() => null),
        update: jest.fn(({ where, data }: any) => ({ id: where.id, ...data })),
      },
      auditLog: {
        create: jest.fn(({ data }: any) => {
          const log = { id: `log-${store.auditLogs.size + 1}`, ...data };
          store.auditLogs.set(log.id, log);
          return log;
        }),
      },
    };

    mockPrisma = {
      vm: {
        findUnique: jest.fn(({ where }: any) => {
          return store.vms.get(where.id) ?? null;
        }),
        findMany: jest.fn(({ where, orderBy }: any) => {
          let vms = Array.from(store.vms.values());
          if (where?.userId) vms = vms.filter((v: any) => v.userId === where.userId);
          if (orderBy?.createdAt === 'desc') vms.reverse();
          return vms;
        }),
      },
      resourcePool: {
        findUnique: jest.fn(({ where }: any) => {
          return store.pools.get(where.id) ?? null;
        }),
      },
      vmTemplate: {
        findUnique: jest.fn(({ where }: any) => {
          return store.templates.get(where.id) ?? null;
        }),
      },
      node: {
        findFirst: jest.fn(() => {
          if (!store.nodes || store.nodes.size === 0) return null;
          const first = store.nodes.values().next().value;
          return first ?? null;
        }),
      },
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
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProxmoxJobService, useValue: mockJobService },
        { provide: ResourcePoolService, useValue: mockPoolService },
        { provide: ProxmoxService, useValue: mockProxmoxService },
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

  describe('getVncUrl', () => {
    it('returns VNC connection info', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', proxmoxId: 100, cpuCores: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.getVncUrl('user-1', 'vm-1');
      expect(result.host).toBeTruthy();
      expect(result.port).toBe('5900');
      expect(result.ticket).toBeTruthy();
      expect(store.auditLogs.size).toBe(1);
    });
  });
});
