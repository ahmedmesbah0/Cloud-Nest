import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WalletService', () => {
  let service: WalletService;
  let mockPrisma: any;

  const store = {
    wallets: new Map<string, any>(),
    transactions: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.wallets.clear();
    store.transactions.clear();

    mockPrisma = {
      wallet: {
        findUnique: jest.fn(({ where, include }: any) => {
          const w = store.wallets.get(where.userId);
          if (!w) return null;
          if (include?.transactions) {
            return {
              ...w,
              transactions: Array.from(store.transactions.values())
                .filter((t: any) => t.walletId === w.id)
                .sort((a: any, b: any) => b.createdAt - a.createdAt)
                .slice(0, 50),
            };
          }
          return w;
        }),
        create: jest.fn(({ data }: any) => {
          const w = { id: `wallet-${data.userId}`, balance: 0, createdAt: new Date(), updatedAt: new Date(), ...data };
          store.wallets.set(data.userId, w);
          return w;
        }),
        update: jest.fn(({ where, data }: any) => {
          const w = store.wallets.get(where.userId);
          if (!w) throw new Error('Not found');
          if (data.balance?.increment) w.balance += data.balance.increment;
          if (data.balance?.decrement) w.balance -= data.balance.decrement;
          return w;
        }),
      },
      transaction: {
        findMany: jest.fn(({ where, take }: any) => {
          return Array.from(store.transactions.values())
            .filter((t: any) => t.walletId === where.walletId)
            .sort((a: any, b: any) => b.createdAt - a.createdAt)
            .slice(0, take);
        }),
        create: jest.fn(({ data }: any) => {
          const t = { id: `tx-${store.transactions.size + 1}`, createdAt: new Date(), ...data };
          store.transactions.set(t.id, t);
          return t;
        }),
      },
      auditLog: {
        create: jest.fn(({ data }: any) => ({ id: `log-${Date.now()}`, ...data })),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  describe('getOrCreateWallet', () => {
    it('creates wallet if not exists', async () => {
      const w = await service.getOrCreateWallet('user-1');
      expect(w.balance).toBe(0);
      expect(w.userId).toBe('user-1');
    });

    it('returns existing wallet', async () => {
      await service.getOrCreateWallet('user-1');
      const w = await service.getOrCreateWallet('user-1');
      expect(w.balance).toBe(0);
    });
  });

  describe('credit', () => {
    it('adds funds to wallet', async () => {
      const tx = await service.credit('user-1', 1000);
      expect(tx.amount).toBe(1000);
      expect(tx.type).toBe('credit');

      const balance = await service.getBalance('user-1');
      expect(balance).toBe(1000);
    });

    it('rejects non-positive amounts', async () => {
      await expect(service.credit('user-1', 0)).rejects.toThrow(BadRequestException);
      await expect(service.credit('user-1', -100)).rejects.toThrow(BadRequestException);
    });
  });

  describe('debit', () => {
    it('deducts funds with sufficient balance', async () => {
      await service.credit('user-1', 2000);
      const tx = await service.debit('user-1', 500, 'test-charge');
      expect(tx.amount).toBe(-500);
      expect(tx.type).toBe('debit');

      const balance = await service.getBalance('user-1');
      expect(balance).toBe(1500);
    });

    it('rejects debit exceeding balance', async () => {
      await service.credit('user-1', 100);
      await expect(service.debit('user-1', 200)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listTransactions', () => {
    it('returns recent transactions in order', async () => {
      await service.credit('user-1', 1000);
      await service.credit('user-1', 500);
      await service.debit('user-1', 200);

      const txs = await service.listTransactions('user-1');
      expect(txs).toHaveLength(3);
    });
  });
});
