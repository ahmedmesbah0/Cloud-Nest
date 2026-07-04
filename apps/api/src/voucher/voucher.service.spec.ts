import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { VoucherRepository } from './voucher.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('VoucherService', () => {
  let service: VoucherService;
  let mockRepo: any;
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

    mockRepo = {
      findByCode: jest.fn(async (code: string) => {
        for (const v of store.vouchers.values()) {
          if ((v as any).code === code) return v;
        }
        return null;
      }),
      findById: jest.fn(async (id: string) => {
        for (const v of store.vouchers.values()) {
          if ((v as any).id === id) return v;
        }
        return null;
      }),
      findMany: jest.fn(async () => Array.from(store.vouchers.values())),
      create: jest.fn(async (data: any, _tx?: any) => {
        const v = {
          id: `v-${store.vouchers.size + 1}`,
          currentRedemptions: 0,
          isActive: true,
          createdAt: new Date(),
          ...data,
        };
        store.vouchers.set(v.id, v);
        return v;
      }),
      update: jest.fn(async (id: string, data: any, _tx?: any) => {
        const v = store.vouchers.get(id);
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
      findRedemption: jest.fn(async (voucherId: string, userId: string) => {
        for (const r of store.redemptions.values()) {
          if ((r as any).voucherId === voucherId && (r as any).userId === userId) return r;
        }
        return null;
      }),
      createRedemption: jest.fn(async (data: any, _tx?: any) => {
        const r = { id: `r-${store.redemptions.size + 1}`, ...data };
        store.redemptions.set(r.id, r);
        return r;
      }),
    };

    mockPrisma = {
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
      auditLog: {
        create: jest.fn(({ data }: any) => ({ id: `log-${Date.now()}`, ...data })),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherService,
        { provide: VoucherRepository, useValue: mockRepo },
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

      await service.deactivateVoucher((v as any).id, 'admin-1');
      expect((v as any).isActive).toBe(false);
    });
  });

  describe('audit logs', () => {
    it('createVoucher writes audit log inside $transaction', async () => {
      await service.createVoucher({ amount: 100, code: 'CHARLOG' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'voucher.create', resource: 'voucher' }),
      });
    });

    it('redeemVoucher writes audit log inside $transaction', async () => {
      await service.createVoucher({ amount: 500, code: 'REDEEMLOG' });
      mockPrisma.auditLog.create.mockClear();
      await service.redeemVoucher('user-1', 'REDEEMLOG');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'voucher.redeem', resource: 'voucher' }),
      });
    });

    it('deactivateVoucher writes audit log inside $transaction', async () => {
      await service.createVoucher({ amount: 200, code: 'DEACTLOG' });
      const v = Array.from(store.vouchers.values()).find((v: any) => (v as any).code === 'DEACTLOG');
      await service.deactivateVoucher((v as any).id, 'admin-1');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'voucher.deactivate', resource: 'voucher' }),
      });
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
