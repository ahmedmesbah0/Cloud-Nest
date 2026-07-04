import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxService } from '../proxmox/proxmox.service';

describe('BillingService', () => {
  let service: BillingService;
  let mockPrisma: any;
  let mockWalletService: any;

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

    mockPrisma = {
      vm: {
        findUnique: jest.fn(({ where }: any) => store.vms.get(where.id) ?? null),
        findMany: jest.fn(({ where }: any) => {
          let vms = Array.from(store.vms.values());
          if (where?.status?.in) {
            vms = vms.filter((v: any) => where.status.in.includes(v.status));
          }
          return vms;
        }),
        update: jest.fn(({ where, data }: any) => {
          const vm = store.vms.get(where.id);
          if (!vm) throw new Error('Not found');
          Object.assign(vm, data);
          return vm;
        }),
      },
      auditLog: {
        create: jest.fn(({ data }: any) => {
          const log = { id: `log-${store.auditLogs.size + 1}`, ...data };
          store.auditLogs.set(log.id, log);
          return log;
        }),
      },
      invoice: {
        create: jest.fn(({ data }: any) => {
          const inv = { id: `inv-${store.invoices.size + 1}`, ...data };
          store.invoices.set(inv.id, inv);
          return inv;
        }),
        findUnique: jest.fn(),
      },
      invoiceLineItem: {
        create: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      wallet: {
        findUnique: jest.fn(),
      },
      node: {
        findUnique: jest.fn(),
      },
      resourceAllocation: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const mockJobService = {
      enqueueJob: jest.fn().mockResolvedValue({ status: 'queued' }),
    };

    const mockPoolService = {
      releaseResources: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockProxmoxService = {
      getVmStatus: jest.fn().mockResolvedValue({ status: 'running' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WalletService, useValue: mockWalletService },
        { provide: ProxmoxJobService, useValue: mockJobService },
        { provide: ResourcePoolService, useValue: mockPoolService },
        { provide: ProxmoxService, useValue: mockProxmoxService },
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
    it('suspends VM, sets suspendedAt, and writes audit log', async () => {
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
  });

  describe('getUsageCharges', () => {
    it('returns hourly debit transactions', async () => {
      store.transactions.set('tx-1', { id: 'tx-1', walletId: 'wallet-user-1', type: 'debit', reference: 'vm:vm-1:hourly', amount: -200 });
      store.transactions.set('tx-2', { id: 'tx-2', walletId: 'wallet-user-1', type: 'credit', reference: 'voucher:CODE', amount: 1000 });
      store.wallets.set('user-1', { id: 'wallet-user-1', balance: 800 });

      mockPrisma.transaction.findMany = jest.fn(() =>
        Array.from(store.transactions.values()).filter(
          (t: any) => t.reference?.includes(':hourly'),
        ),
      );

      const charges = await service.getUsageCharges('user-1');
      expect(charges).toHaveLength(1);
      expect(charges[0].reference).toContain(':hourly');
    });
  });
});
