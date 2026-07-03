import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { PrismaService } from '../prisma/prisma.service';

describe('VoucherService', () => {
  let service: VoucherService;
  let mockPrisma: any;

  const store = {
    vouchers: new Map<string, any>(),
    redemptions: new Map<string, any>(),
    wallets: new Map<string, any>(),
    transactions: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.vouchers.clear();
    store.redemptions.clear();
    store.wallets.clear();
    store.transactions.clear();

    mockPrisma = {
      voucherCode: {
        findUnique: jest.fn(({ where }: any) => {
          for (const v of store.vouchers.values()) {
            if ((v as any).code === where.code || (v as any).id === where.id) return v;
          }
          return null;
        }),
        findMany: jest.fn(() => Array.from(store.vouchers.values())),
        create: jest.fn(({ data }: any) => {
          const v = { id: `v-${store.vouchers.size + 1}`, currentRedemptions: 0, isActive: true, createdAt: new Date(), ...data };
          store.vouchers.set(v.id, v);
          return v;
        }),
        update: jest.fn(({ where, data }: any) => {
          const v = store.vouchers.get(where.id);
          if (!v) throw new Error('Not found');
          for (const [key, val] of Object.entries(data)) {
            if (typeof val === 'object' && val !== null && 'increment' in val) {
              (v as any)[key] += (val as any).increment;
            } else {
              (v as any)[key] = val;
            }
          }
          return v;
        }),
      },
      voucherRedemption: {
        findFirst: jest.fn(({ where }: any) => {
          for (const r of store.redemptions.values()) {
            if ((r as any).voucherId === where.voucherId && (r as any).userId === where.userId) return r;
          }
          return null;
        }),
        create: jest.fn(({ data }: any) => {
          const r = { id: `r-${store.redemptions.size + 1}`, ...data };
          store.redemptions.set(r.id, r);
          return r;
        }),
      },
      wallet: {
        findUnique: jest.fn(({ where }: any) => store.wallets.get(where.userId) ?? null),
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
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VoucherService>(VoucherService);
  });

  describe('createVoucher', () => {
    it('creates a voucher with auto-generated code', async () => {
      const v = await service.createVoucher({ amount: 1000, maxRedemptions: 5 });
      expect(v.amount).toBe(1000);
      expect(v.code).toBeDefined();
      expect(v.isActive).toBe(true);
    });

    it('creates a voucher with custom code', async () => {
      const v = await service.createVoucher({ amount: 500, code: 'WELCOME50' });
      expect(v.code).toBe('WELCOME50');
    });

    it('rejects duplicate code', async () => {
      await service.createVoucher({ amount: 100, code: 'DUPE' });
      await expect(service.createVoucher({ amount: 200, code: 'DUPE' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('redeemVoucher', () => {
    it('redeems a valid voucher and credits wallet', async () => {
      await service.createVoucher({ amount: 1000, code: 'GET10' });

      const result = await service.redeemVoucher('user-1', 'GET10');
      expect(result.message).toContain('1000 cents credited');
      expect(result.amount).toBe(1000);

      // Verify wallet got credited
      expect(store.wallets.get('user-1').balance).toBe(1000);
    });

    it('rejects invalid code', async () => {
      await expect(service.redeemVoucher('user-1', 'FAKE')).rejects.toThrow(BadRequestException);
    });

    it('rejects expired voucher', async () => {
      await service.createVoucher({
        amount: 500,
        code: 'EXPIRED',
        expiresAt: new Date(Date.now() - 86400000),
      });

      await expect(service.redeemVoucher('user-1', 'EXPIRED')).rejects.toThrow(BadRequestException);
    });

    it('rejects fully redeemed voucher', async () => {
      await service.createVoucher({ amount: 500, code: 'MAXED', maxRedemptions: 1 });
      // Manually set redemptions
      const v = Array.from(store.vouchers.values()).find((v: any) => (v as any).code === 'MAXED');
      (v as any).currentRedemptions = 1;

      await expect(service.redeemVoucher('user-2', 'MAXED')).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate redemption by same user', async () => {
      await service.createVoucher({ amount: 500, code: 'ONCE' });
      await service.redeemVoucher('user-1', 'ONCE');

      await expect(service.redeemVoucher('user-1', 'ONCE')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivateVoucher', () => {
    it('deactivates a voucher', async () => {
      await service.createVoucher({ amount: 500, code: 'DEACTIVATE' });
      const v = Array.from(store.vouchers.values()).find((v: any) => (v as any).code === 'DEACTIVATE');

      await service.deactivateVoucher((v as any).id);
      expect((v as any).isActive).toBe(false);
    });
  });

  describe('getVoucherStats', () => {
    it('returns stats', async () => {
      await service.createVoucher({ amount: 1000, code: 'A' });
      await service.createVoucher({ amount: 500, code: 'B' });
      await service.redeemVoucher('user-1', 'A');

      const stats = await service.getVoucherStats();
      expect(stats.totalVouchers).toBe(2);
      expect(stats.totalRedemptions).toBe(1);
      expect(stats.totalValueRedeemed).toBe(1000);
    });
  });
});
