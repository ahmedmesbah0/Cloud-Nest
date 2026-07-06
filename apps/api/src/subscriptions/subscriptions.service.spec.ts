import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { WalletService } from '../wallet/wallet.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ProxmoxService } from '../proxmox/proxmox.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let subsRepo: any;
  let mockPrisma: any;
  let mockWalletService: any;
  let mockJobService: any;
  let mockProxmox: any;

  const store = {
    plans: new Map<string, any>(),
    subscriptions: new Map<string, any>(),
    vms: new Map<string, any>(),
    nodes: new Map<string, any>(),
    pools: new Map<string, any>(),
    allocations: new Map<string, any>(),
    ips: new Map<string, any>(),
    templates: new Map<string, any>(),
    auditLogs: new Map<string, any>(),
    wallets: new Map<string, any>(),
  };

  beforeEach(async () => {
    for (const m of Object.values(store)) (m as Map<string, any>).clear();

    store.templates.set('tmpl-1', { id: 'tmpl-1', proxmoxTemplateId: '1000', name: 'Ubuntu 22.04' });

    store.plans.set('plan-1', {
      id: 'plan-1',
      name: 'Starter',
      priceCredits: 5000,
      billingPeriodDays: 30,
      cpuCores: 2,
      memoryMb: 2048,
      diskGb: 25,
      backupLimit: 3,
      snapshotLimit: 2,
      serverLimit: 1,
      templateId: 'tmpl-1',
      isActive: true,
      maxSubscriptions: null,
      allowedUpgradePlanIds: [],
      allowedDowngradePlanIds: [],
    });

    store.nodes.set('node-1', {
      id: 'node-1',
      proxmoxNodeId: 'pve-node',
      name: 'Main Node',
      host: '10.0.0.1',
      isActive: true,
    });

    store.wallets.set('u-1', { id: 'wallet-u-1', userId: 'u-1', balance: 50000 });

    subsRepo = {
      findSubscriptionById: jest.fn(async (id: string) => store.subscriptions.get(id) ?? null),
      findSubscriptionsByUser: jest.fn(async (userId: string) =>
        Array.from(store.subscriptions.values()).filter((s: any) => s.userId === userId),
      ),
      findActiveSubscriptionsByUser: jest.fn(async (userId: string) =>
        Array.from(store.subscriptions.values()).filter(
          (s: any) => s.userId === userId && ['active', 'pending'].includes(s.status),
        ),
      ),
      findSubscriptionsDueForRenewal: jest.fn(),
      findSubscriptionsInGracePeriod: jest.fn(),
      createSubscription: jest.fn(async (data: any) => {
        const sub = { id: `sub-${store.subscriptions.size + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.subscriptions.set(sub.id, sub);
        return sub;
      }),
      updateSubscription: jest.fn(async (id: string, data: any) => {
        const sub = store.subscriptions.get(id);
        if (!sub) throw new NotFoundException();
        Object.assign(sub, data);
        return sub;
      }),
      countSubscriptions: jest.fn(),
      findSubscriptionsPaginated: jest.fn(),
      findVmById: jest.fn(async (id: string) => store.vms.get(id) ?? null),
      findPoolByUser: jest.fn(),
      findFirstActiveNode: jest.fn(async () => {
        for (const n of store.nodes.values()) {
          if ((n as any).isActive) return n;
        }
        return null;
      }),
      findAvailableIp: jest.fn(async () => {
        for (const ip of store.ips.values()) {
          if (!(ip as any).isAssigned) return ip;
        }
        return null;
      }),
      createVm: jest.fn(async (data: any) => {
        const vm = { id: `vm-${store.vms.size + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.vms.set(vm.id, vm);
        return vm;
      }),
      createAllocation: jest.fn(async (data: any) => {
        const alloc = { id: `alloc-${store.allocations.size + 1}`, ...data };
        store.allocations.set(alloc.id, alloc);
        return alloc;
      }),
      lockPoolById: jest.fn(async (poolId: string) => {
        const pool = store.pools.get(poolId);
        return [pool];
      }),
      sumAllocationsByPool: jest.fn(async () => [{ cores: 0, memoryMb: 0, diskGb: 0, ips: 0 }]),
      findTemplateById: jest.fn(async (id: string) => store.templates.get(id) ?? null),
      updateVm: jest.fn(async (id: string, data: any) => {
        const vm = store.vms.get(id);
        if (vm) Object.assign(vm, data);
        return vm;
      }),
    };

    mockPrisma = {
      ipAddress: {
        update: jest.fn(async ({ where, data }: any) => {
          const ip = store.ips.get(where.id);
          if (ip) Object.assign(ip, data);
          return ip;
        }),
      },
      vm: { findUnique: jest.fn() },
      auditLog: {
        create: jest.fn(({ data }: any) => {
          const log = { id: `log-${store.auditLogs.size + 1}`, ...data };
          store.auditLogs.set(log.id, log);
          return log;
        }),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    mockWalletService = {
      debit: jest.fn().mockResolvedValue({ id: 'tx-1', amount: -5000, type: 'debit' }),
      credit: jest.fn().mockResolvedValue({ id: 'tx-2', amount: 5000, type: 'credit' }),
      getOrCreateWallet: jest.fn(async (userId: string) => store.wallets.get(userId) ?? { id: `w-${userId}`, userId, balance: 0 }),
    };

    mockJobService = {
      enqueueJob: jest.fn().mockResolvedValue({ idempotencyKey: 'ik-1', jobId: 'job-1', status: 'queued' }),
      findIdempotencyKey: jest.fn(),
      completeIdempotencyKey: jest.fn(),
      failIdempotencyKey: jest.fn(),
    };

    mockProxmox = {
      getNextVmid: jest.fn().mockResolvedValue(200),
    };

    const mockPlansService = {
      getPlan: jest.fn(async (id: string) => {
        const plan = store.plans.get(id);
        if (!plan) throw new NotFoundException('Plan not found');
        return plan;
      }),
      validateCoupon: jest.fn(),
    };

    const mockPoolService = {
      getUserPools: jest.fn().mockResolvedValue([]),
      createPool: jest.fn(async (data: any) => {
        const pool = { id: `pool-${store.pools.size + 1}`, ...data };
        store.pools.set(pool.id, pool);
        return pool;
      }),
      allocateResources: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: SubscriptionsRepository, useValue: subsRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlansService, useValue: mockPlansService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: ResourcePoolService, useValue: mockPoolService },
        { provide: ProxmoxJobService, useValue: mockJobService },
        { provide: ProxmoxService, useValue: mockProxmox },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  describe('subscribe (characterization — old broken behavior)', () => {
    it('CHARACTERIZATION: old behavior did NOT enqueue create-vm job (kept for reference)', () => {
      // Before the fix: subscribe() created a VM with proxmoxId=null and
      // status='provisioning' but never enqueued a create-vm BullMQ job,
      // leaving the VM stuck in provisioning state forever.
      // This test is preserved to document that the behavior changed.
    });
  });

  describe('subscribe (regression — after fix)', () => {
    it('enqueues a create-vm job with correct VM/user/plan data after subscription creation', async () => {
      const result = await service.subscribe('u-1', { planId: 'plan-1' });

      expect(mockProxmox.getNextVmid).toHaveBeenCalled();
      expect(result.status).toBe('active');

      const vmId = result.vmId;
      const vm = store.vms.get(vmId);
      expect(vm).toBeDefined();
      expect(vm.proxmoxId).toBe(200);
      expect(vm.status).toBe('provisioning');

      const createVmCalls = (mockJobService.enqueueJob as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'create-vm',
      );
      expect(createVmCalls.length).toBe(1);

      const [type, payload, options] = createVmCalls[0];
      expect(type).toBe('create-vm');
      expect(payload.vmId).toBe(vmId);
      expect(payload.vmid).toBe(200);
      expect(payload.name).toBeDefined();
      expect(payload.cores).toBe(2);
      expect(payload.memory).toBe(2048);
      expect(payload.disk).toBe(25);
      expect(payload.templateVmid).toBe(1000);
      expect(payload.node).toBe('pve-node');
      expect(options.userId).toBe('u-1');
      expect(options.auditLog).toBeDefined();
      expect(options.auditLog!.action).toBe('vm.provision');
    });

    it('sets VM to provisioning_failed status if create-vm job enqueue fails', async () => {
      mockJobService.enqueueJob.mockRejectedValueOnce(new Error('Redis unreachable'));

      const result = await service.subscribe('u-1', { planId: 'plan-1' });

      expect(result.status).toBe('active');

      const vmId = result.vmId;
      const vm = store.vms.get(vmId);
      expect(vm.status).toBe('provisioning_failed');
    });

    it('rejects subscribe when Proxmox getNextVmid fails', async () => {
      mockProxmox.getNextVmid.mockRejectedValueOnce(new Error('Proxmox unreachable'));

      await expect(service.subscribe('u-1', { planId: 'plan-1' })).rejects.toThrow('Proxmox unreachable');
    });
  });
});
