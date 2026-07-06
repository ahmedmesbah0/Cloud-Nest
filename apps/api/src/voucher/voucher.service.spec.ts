import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { VoucherRepository } from './voucher.repository';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

describe('VoucherService', () => {
  let service: VoucherService;
  let mockRepo: any;
  let mockPrisma: any;
  let mockWalletService: any;

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
      auditLog: {
        create: jest.fn(({ data }: any) => ({ id: `log-${Date.now()}`, ...data })),
      },
      voucherCode: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.currentRedemptions?.lt !== undefined) {
            const v = Array.from(store.vouchers.values()).find((v: any) => v.id === where.id);
            if (!v || (v as any).currentRedemptions >= where.currentRedemptions.lt) {
              return { count: 0 };
            }
          }
          const v = store.vouchers.get(where.id);
          if (v) {
            for (const [key, val] of Object.entries(data)) {
              if (typeof val === 'object' && val !== null && 'increment' in val) {
                (v as any)[key] += (val as any).increment;
              } else {
                (v as any)[key] = val;
              }
            }
          }
          return { count: 1 };
        }),
      },
      voucherRedemption: {
        create: jest.fn(async (data: any) => {
          const r = { id: `r-${store.redemptions.size + 1}`, ...data.data };
          store.redemptions.set(r.id, r);
          return r;
        }),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    mockWalletService = {
      credit: jest.fn(async (_userId: string, amount: number, _ref?: string, _meta?: any) => {
        const w = store.wallets.get(_userId) ?? { id: `w-${_userId}`, userId: _userId, balance: 0 };
        w.balance += amount;
        store.wallets.set(_userId, w);
        return { id: `tx-${store.transactions.size + 1}`, walletId: w.id, amount, type: 'credit' };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherService,
        { provide: VoucherRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WalletService, useValue: mockWalletService },
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

      expect(mockWalletService.credit).toHaveBeenCalledWith('user-1', 1000, 'voucher:GET10', { voucherId: expect.any(String) });
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

    it('redeemVoucher delegates credit to WalletService', async () => {
      await service.createVoucher({ amount: 500, code: 'REDEEMLOG' });
      mockWalletService.credit.mockClear();
      await service.redeemVoucher('user-1', 'REDEEMLOG');
      expect(mockWalletService.credit).toHaveBeenCalledWith('user-1', 500, 'voucher:REDEEMLOG', expect.any(Object));
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
