import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { BillingRepository } from './billing.repository';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { IdempotencyKeyRepository } from '../bullmq/idempotency-key.repository';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('BillingService', () => {
  let service: BillingService;
  let mockRepo: any;
  let mockPrisma: any;
  let mockWalletService: any;
  let mockJobService: any;
  let mockNotificationsService: any;
  let mockIdempotencyRepo: any;

  const store = {
    vms: new Map<string, any>(),
    wallets: new Map<string, any>(),
    transactions: new Map<string, any>(),
    auditLogs: new Map<string, any>(),
    invoices: new Map<string, any>(),
    invoiceLineItems: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.vms.clear();
    store.wallets.clear();
    store.transactions.clear();
    store.auditLogs.clear();
    store.invoices.clear();
    store.invoiceLineItems.clear();

    mockWalletService = {
      getOrCreateWallet: jest.fn().mockImplementation(async (userId: string) => {
        let w = store.wallets.get(userId);
        if (!w) {
          w = { id: `wallet-${userId}`, userId, balance: 0 };
          store.wallets.set(userId, w);
        }
        return w;
      }),
      debit: jest.fn().mockImplementation(async (userId: string, amount: number, reference: string) => {
        const w = store.wallets.get(userId);
        if (!w || w.balance < amount) {
          throw new Error('Insufficient balance');
        }
        w.balance -= amount;
        const tx = { id: `tx-${store.transactions.size + 1}`, walletId: w.id, amount: -amount, type: 'debit', reference };
        store.transactions.set(tx.id, tx);
        return tx;
      }),
      credit: jest.fn(),
    };

    mockRepo = {
      findVmsByStatus: jest.fn(async (statuses: string[]) => {
        return Array.from(store.vms.values()).filter((v: any) => statuses.includes(v.status));
      }),
      findVmById: jest.fn(async (id: string) => store.vms.get(id) ?? null),
      updateVm: jest.fn(async (id: string, data: any) => {
        const vm = store.vms.get(id);
        if (!vm) throw new Error('Not found');
        Object.assign(vm, data);
        return vm;
      }),
      findNodeById: jest.fn(),
      findWalletByUser: jest.fn(async (userId: string) => store.wallets.get(userId) ?? null),
      findTransactions: jest.fn(async (where: any) => {
        return Array.from(store.transactions.values()).filter((t: any) => {
          for (const [key, val] of Object.entries(where)) {
            if (typeof val === 'object' && val !== null && 'contains' in val) {
              if (!(t as any)[key]?.includes((val as any).contains)) return false;
            } else if ((t as any)[key] !== val) return false;
          }
          return true;
        });
      }),
      updateTransactions: jest.fn(async (_where: any, _data: any) => {}),
      createInvoice: jest.fn(async (data: any, _tx?: any) => {
        const inv = { id: `inv-${store.invoices.size + 1}`, ...data };
        store.invoices.set(inv.id, inv);
        if (data.lineItems?.create) {
          for (const li of data.lineItems.create) {
            const item = { id: `li-${store.invoiceLineItems.size + 1}`, invoiceId: inv.id, ...li };
            store.invoiceLineItems.set(item.id, item);
          }
        }
        return inv;
      }),
      findInvoiceById: jest.fn(async (id: string, include?: any) => {
        const inv = store.invoices.get(id);
        if (!inv) return null;
        if (include?.lineItems) {
          return {
            ...inv,
            lineItems: Array.from(store.invoiceLineItems.values()).filter((li: any) => li.invoiceId === inv.id),
          };
        }
        if (include?.user) {
          return { ...inv, user: { name: 'Test', email: 'test@test.com' } };
        }
        return inv;
      }),
      findInvoices: jest.fn(async (userId: string, skip: number, take: number) => {
        const invoices = Array.from(store.invoices.values())
          .filter((inv: any) => inv.userId === userId)
          .sort((a: any, b: any) => b.createdAt - a.createdAt)
          .slice(skip, skip + take);
        return { invoices, total: invoices.length };
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
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    mockIdempotencyRepo = {
      findByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ key: 'test', action: 'billing-hourly', status: 'completed' }),
    };

    mockJobService = {
      enqueueJob: jest.fn().mockResolvedValue({ status: 'queued' }),
    };

    const mockPoolService = {
      releaseResources: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockProxmoxService = {
      getVmStatus: jest.fn().mockResolvedValue({ status: 'running' }),
    };

    mockNotificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: BillingRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WalletService, useValue: mockWalletService },
        { provide: ProxmoxJobService, useValue: mockJobService },
        { provide: IdempotencyKeyRepository, useValue: mockIdempotencyRepo },
        { provide: ResourcePoolService, useValue: mockPoolService },
        { provide: ProxmoxService, useValue: mockProxmoxService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('runHourlyBilling', () => {
    it('bills running VMs and deducts from wallet', async () => {
      store.vms.set('vm-1', {
        id: 'vm-1',
        userId: 'user-1',
        name: 'test-vm',
        status: 'running',
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.wallets.set('user-1', { id: 'wallet-1', userId: 'user-1', balance: 100000 });

      const result = await service.runHourlyBilling();
      expect(result.billed).toBe(1);
      expect(result.suspended).toBe(0);

      const wallet = store.wallets.get('user-1');
      expect(wallet.balance).toBeLessThan(100000);
    });

    it('suspends VM when billing fails due to insufficient balance', async () => {
      const now = new Date();
      store.vms.set('vm-2', {
        id: 'vm-2',
        userId: 'user-2',
        name: 'test-vm',
        status: 'running',
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 50,
        createdAt: now,
        updatedAt: now,
      });
      store.wallets.set('user-2', { id: 'wallet-2', userId: 'user-2', balance: 0 });

      await service.runHourlyBilling();

      const vm = store.vms.get('vm-2');
      expect(vm.status).toBe('suspended');
      expect(vm.suspendedAt).toBeDefined();
      expect(store.auditLogs.size).toBe(1);
    });

    it('processes multiple VMs correctly', async () => {
      store.vms.set('vm-1', { id: 'vm-1', userId: 'user-1', name: 'vm1', status: 'running', cpuCores: 1, memoryMb: 1024, diskGb: 20, createdAt: new Date(), updatedAt: new Date() });
      store.vms.set('vm-2', { id: 'vm-2', userId: 'user-1', name: 'vm2', status: 'stopped', cpuCores: 2, memoryMb: 4096, diskGb: 50, createdAt: new Date(), updatedAt: new Date() });
      store.wallets.set('user-1', { id: 'wallet-1', userId: 'user-1', balance: 50000 });

      const result = await service.runHourlyBilling();
      expect(result.billed).toBe(2);
    });

    it('skips VM when idempotency key already exists', async () => {
      store.vms.set('vm-7', {
        id: 'vm-7',
        userId: 'user-1',
        name: 'already-billed',
        status: 'running',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.wallets.set('user-1', { id: 'wallet-1', userId: 'user-1', balance: 10000 });

      // Simulate existing idempotency key (P2002)
      mockIdempotencyRepo.create.mockRejectedValueOnce({ code: 'P2002' });

      const result = await service.runHourlyBilling();
      expect(result.billed).toBe(0);
      expect(result.suspended).toBe(0);

      const wallet = store.wallets.get('user-1');
      expect(wallet.balance).toBe(10000);
    });

    it('creates idempotency key for each VM on successful billing', async () => {
      store.vms.set('vm-8', {
        id: 'vm-8',
        userId: 'user-1',
        name: 'tracked-vm',
        status: 'running',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.wallets.set('user-1', { id: 'wallet-1', userId: 'user-1', balance: 10000 });

      await service.runHourlyBilling();

      expect(mockIdempotencyRepo.create).toHaveBeenCalledWith({
        key: expect.stringContaining('billing-hourly-vm-8-'),
        action: 'billing-hourly',
        status: 'completed',
      });
    });
  });

  describe('getVmBillingEstimate', () => {
    it('returns correct cost estimates', async () => {
      store.vms.set('vm-1', {
        id: 'vm-1',
        userId: 'user-1',
        status: 'running',
        cpuCores: 2,
        memoryMb: 4096,
        diskGb: 50,
      });

      const estimate = await service.getVmBillingEstimate('vm-1');
      expect(estimate.hourlyCost).toBe(240);
      expect(estimate.dailyCost).toBe(240 * 24);
      expect(estimate.monthlyCost).toBe(240 * 730);
    });
  });

  describe('enterGracePeriod', () => {
    it('sets VM to suspended and writes audit log for VM without proxmoxId', async () => {
      const now = new Date();
      store.vms.set('vm-1', {
        id: 'vm-1',
        userId: 'user-1',
        status: 'running',
        cpuCores: 1, memoryMb: 1024, diskGb: 20,
        createdAt: now,
        updatedAt: now,
      });

      await service.enterGracePeriod('vm-1');
      const vm = store.vms.get('vm-1');
      expect(vm.status).toBe('suspended');
      expect(vm.suspendedAt).toBeDefined();
      expect(store.auditLogs.size).toBe(1);
    });

    it('enqueues stop-vm job for VMs with proxmoxId', async () => {
      const now = new Date();
      store.vms.set('vm-2', {
        id: 'vm-2',
        userId: 'user-1',
        status: 'running',
        cpuCores: 1, memoryMb: 1024, diskGb: 20,
        proxmoxId: 102,
        nodeId: 'node-1',
        name: 'test-vm-2',
        createdAt: now,
        updatedAt: now,
      });

      await service.enterGracePeriod('vm-2');

      const vm = store.vms.get('vm-2');
      expect(vm.status).toBe('suspended');
      expect(mockJobService.enqueueJob).toHaveBeenCalledWith(
        'stop-vm',
        { vmId: 'vm-2', proxmoxId: 102, node: 'node-1' },
        expect.objectContaining({
          idempotencyKey: expect.stringContaining('suspend-vm-vm-2-'),
          auditLog: { action: 'vm.stop.suspend', resource: 'vm', resourceId: 'vm-2' },
        }),
      );
    });

    it('does not advance DB state when enqueueJob throws', async () => {
      const now = new Date();
      store.vms.set('vm-3', {
        id: 'vm-3',
        userId: 'user-1',
        status: 'running',
        cpuCores: 1, memoryMb: 1024, diskGb: 20,
        proxmoxId: 103,
        nodeId: 'node-1',
        name: 'test-vm-3',
        createdAt: now,
        updatedAt: now,
      });

      mockJobService.enqueueJob.mockRejectedValueOnce(new Error('Redis unreachable'));

      await service.enterGracePeriod('vm-3');

      const vm = store.vms.get('vm-3');
      expect(vm.status).toBe('running');
      expect(vm.suspendedAt).toBeUndefined();
      expect(store.auditLogs.size).toBe(0);
    });

    it('does not advance DB state when enqueue returns skipped with status=failed', async () => {
      const now = new Date();
      store.vms.set('vm-4', {
        id: 'vm-4',
        userId: 'user-1',
        status: 'running',
        cpuCores: 1, memoryMb: 1024, diskGb: 20,
        proxmoxId: 104,
        nodeId: 'node-1',
        name: 'test-vm-4',
        createdAt: now,
        updatedAt: now,
      });

      mockJobService.enqueueJob.mockResolvedValueOnce({ skipped: true, status: 'failed', idempotencyKey: 'suspend-vm-vm-4-12345' });

      await service.enterGracePeriod('vm-4');

      const vm = store.vms.get('vm-4');
      expect(vm.status).toBe('running');
      expect(store.auditLogs.size).toBe(0);
    });

    it('proceeds with suspension when enqueue is skipped with status=completed or pending', async () => {
      const now = new Date();
      store.vms.set('vm-5', {
        id: 'vm-5',
        userId: 'user-1',
        status: 'running',
        cpuCores: 1, memoryMb: 1024, diskGb: 20,
        proxmoxId: 105,
        nodeId: 'node-1',
        name: 'test-vm-5',
        createdAt: now,
        updatedAt: now,
      });

      mockJobService.enqueueJob.mockResolvedValueOnce({ skipped: true, status: 'completed', idempotencyKey: 'suspend-vm-vm-5-12345' });

      await service.enterGracePeriod('vm-5');

      const vm = store.vms.get('vm-5');
      expect(vm.status).toBe('suspended');
      expect(store.auditLogs.size).toBe(1);
    });

    it('creates in-app notification after suspension', async () => {
      const now = new Date();
      store.vms.set('vm-6', {
        id: 'vm-6',
        userId: 'user-1',
        status: 'running',
        cpuCores: 1, memoryMb: 1024, diskGb: 20,
        proxmoxId: 106,
        nodeId: 'node-1',
        name: 'SuspendedVM',
        createdAt: now,
        updatedAt: now,
      });

      await service.enterGracePeriod('vm-6');

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        'user-1',
        'VM Suspended',
        expect.stringContaining('"SuspendedVM"'),
      );
    });
  });

  describe('audit logs', () => {
    it('createInvoice writes audit log inside $transaction', async () => {
      store.vms.set('vm-1', {
        id: 'vm-1', userId: 'user-1', name: 'test-vm', status: 'running',
        cpuCores: 2, memoryMb: 4096, diskGb: 50,
        createdAt: new Date(), updatedAt: new Date(),
      });
      store.wallets.set('user-1', { id: 'wallet-1', userId: 'user-1', balance: 100000 });

      await service.runHourlyBilling();

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'invoice.create', resource: 'invoice' }),
      });
    });
  });

  describe('getUsageCharges', () => {
    it('returns hourly debit transactions', async () => {
      store.transactions.set('tx-1', { id: 'tx-1', walletId: 'wallet-user-1', type: 'debit', reference: 'vm:vm-1:hourly', amount: -200 });
      store.transactions.set('tx-2', { id: 'tx-2', walletId: 'wallet-user-1', type: 'credit', reference: 'voucher:CODE', amount: 1000 });
      store.wallets.set('user-1', { id: 'wallet-user-1', balance: 800 });

      const charges = await service.getUsageCharges('user-1');
      expect(charges).toHaveLength(1);
      expect(charges[0].reference).toContain(':hourly');
    });
  });
});
