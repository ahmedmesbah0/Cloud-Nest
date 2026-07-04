const mockTotpVerify = jest.fn();

jest.mock('@otplib/totp', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
    verify: jest.fn((...args: any[]) => mockTotpVerify(...args)),
    toURI: jest
      .fn()
      .mockReturnValue('otpauth://totp/CloudNest:test@example.com?secret=JBSWY3DPEHPK3PXP'),
  })),
}));

jest.mock('@otplib/plugin-crypto-noble', () => ({ NobleCryptoPlugin: jest.fn() }));
jest.mock('@otplib/plugin-base32-scure', () => ({ ScureBase32Plugin: jest.fn() }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,iVBOR') }));

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('AuthService', () => {
  let service: AuthService;
  const mockMailService = { send: jest.fn() };

  // In-memory store simulates real DB state across calls
  const store = {
    users: new Map<string, any>(),
    sessions: new Map<string, any>(),
    roles: new Map<string, any>(),
    userRoles: new Map<string, any>(),
  };

  const mockAuditLogCreate = jest.fn().mockResolvedValue({});

  const mockTx = (tx?: any): any => tx || {
    user: {
      count: jest.fn(() => store.users.size),
      create: jest.fn((args: { data: any }) => {
        const user = {
          id: `user-${store.users.size + 1}`,
          emailVerified: false,
          totpEnabled: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        };
        store.users.set(user.id, user);
        return user;
      }),
      update: jest.fn((args: { where: { id: string }; data: any }) => {
        const user = store.users.get(args.where.id);
        if (!user) throw new Error('User not found');
        Object.assign(user, args.data);
        return user;
      }),
    },
    userRole: {
      create: jest.fn((args: { data: { userId: string; roleId: string } }) => {
        const ur = { id: `ur-${store.userRoles.size + 1}`, ...args.data };
        store.userRoles.set(ur.id, ur);
        return ur;
      }),
    },
    session: {
      deleteMany: jest.fn((args: { where: { userId?: string; refreshToken?: string } }) => {
        if (args.where.userId) {
          for (const [id, s] of store.sessions) {
            if (s.userId === args.where.userId) store.sessions.delete(id);
          }
        }
        if (args.where.refreshToken) {
          for (const [id, s] of store.sessions) {
            if (s.refreshToken === args.where.refreshToken) store.sessions.delete(id);
          }
        }
        return { count: 1 };
      }),
    },
    auditLog: {
      create: mockAuditLogCreate,
    },
  };

  const mockPrisma = {
    $transaction: jest.fn(async (fn: any) => fn(mockTx())),
    user: {
      count: jest.fn(() => store.users.size),
      findUnique: jest.fn((args: { where: { id?: string; email?: string } }) => {
        for (const u of store.users.values()) {
          if (args.where.id && u.id === args.where.id) return u;
          if (args.where.email && u.email === args.where.email) return u;
        }
        return null;
      }),
      findFirst: jest.fn((args: { where: Record<string, any> }) => {
        for (const u of store.users.values()) {
          const match = Object.entries(args.where).every(
            ([k, v]) => (u as any)[k] === v,
          );
          if (match) return u;
        }
        return null;
      }),
      create: jest.fn((args: { data: any }) => {
        const user = {
          id: `user-${store.users.size + 1}`,
          emailVerified: false,
          totpEnabled: false,
          isActive: true,
          roles: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        };
        store.users.set(user.id, user);
        return user;
      }),
      update: jest.fn((args: { where: { id: string }; data: any }) => {
        const user = store.users.get(args.where.id);
        if (!user) throw new Error('User not found');
        Object.assign(user, args.data);
        return user;
      }),
    },
    role: {
      upsert: jest.fn((args: { where: { name: string }; create: any; update: any }) => {
        for (const r of store.roles.values()) {
          if (r.name === args.where.name) return r;
        }
        const role = {
          id: `role-${store.roles.size + 1}`,
          name: args.create.name,
          description: args.create.description,
        };
        store.roles.set(role.id, role);
        return role;
      }),
    },
    userRole: {
      create: jest.fn((args: { data: { userId: string; roleId: string } }) => {
        const ur = { id: `ur-${store.userRoles.size + 1}`, ...args.data };
        store.userRoles.set(ur.id, ur);
        return ur;
      }),
    },
    session: {
      findMany: jest.fn((args: { where: { refreshToken?: string } }) => {
        const results: any[] = [];
        for (const s of store.sessions.values()) {
          if (args.where?.refreshToken && s.refreshToken === args.where.refreshToken) {
            results.push(s);
          }
        }
        return results;
      }),
      findUnique: jest.fn((args: { where: { refreshToken: string } }) => {
        for (const s of store.sessions.values()) {
          if (s.refreshToken === args.where.refreshToken) return s;
        }
        return null;
      }),
      create: jest.fn((args: { data: any }) => {
        const session = { id: `session-${store.sessions.size + 1}`, ...args.data };
        store.sessions.set(session.id, session);
        return session;
      }),
      delete: jest.fn((args: { where: { id: string } }) => {
        store.sessions.delete(args.where.id);
        return { id: args.where.id };
      }),
      deleteMany: jest.fn((args: { where: { userId?: string; refreshToken?: string } }) => {
        if (args.where.userId) {
          for (const [id, s] of store.sessions) {
            if (s.userId === args.where.userId) store.sessions.delete(id);
          }
        }
        if (args.where.refreshToken) {
          for (const [id, s] of store.sessions) {
            if (s.refreshToken === args.where.refreshToken) store.sessions.delete(id);
          }
        }
        return { count: 1 };
      }),
    },
  };

  const mockJwtService = { sign: jest.fn().mockReturnValue('jwt-access-token') };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const cfg: Record<string, any> = {
        JWT_ACCESS_SECRET: 'test-secret',
        JWT_REFRESH_EXPIRY: '7d',
        JWT_ACCESS_EXPIRY: '15m',
        NEXT_PUBLIC_API_URL: 'http://localhost:3000',
        TOTP_ISSUER: 'CloudNest',
      };
      return cfg[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    mockTotpVerify.mockResolvedValue({ valid: true, delta: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    store.users.clear();
    store.sessions.clear();
    store.roles.clear();
    store.userRoles.clear();
    jest.clearAllMocks();
  });

  // ─── Registration ───────────────────────────────────────────

  describe('register', () => {
    it('creates a user, returns id/email/name, and first user becomes admin', async () => {
      const result = await service.register({
        email: 'alice@test.com',
        password: 'StrongP4ss!',
        name: 'Alice',
      });

      expect(result).toEqual({
        id: expect.stringMatching(/^user-/),
        email: 'alice@test.com',
        name: 'Alice',
        isAdmin: true,
      });

      // User persisted in store
      expect(store.users.size).toBe(1);
      const saved = store.users.get(result.id);
      expect(saved.email).toBe('alice@test.com');
      expect(saved.passwordHash).not.toBe('StrongP4ss!'); // hashed
      expect(saved.emailVerified).toBe(true); // first user auto-verified
      expect(saved.emailVerifyToken).toBeUndefined(); // no email sent

      // Admin and customer roles assigned
      expect(store.userRoles.size).toBe(2);
    });

    it('rejects duplicate email with ConflictException', async () => {
      await service.register({ email: 'dup@test.com', password: 'StrongP4ss!' });
      await expect(
        service.register({ email: 'dup@test.com', password: 'OtherP4ss!' }),
      ).rejects.toThrow(ConflictException);

      expect(store.users.size).toBe(1); // only the first one
    });

    it('allows registration without optional name', async () => {
      const result = await service.register({
        email: 'noname@test.com',
        password: 'StrongP4ss!',
      });
      expect(result.name).toBeUndefined();
    });
  });

  // ─── Email verification ─────────────────────────────────────

  describe('verifyEmail', () => {
    beforeEach(async () => {
      // Seed a first user so test users are not auto-verified admin
      await service.register({ email: 'seed-verify@test.com', password: 'SeedP4ss!' });
    });

    it('marks email as verified when token matches', async () => {
      const { id } = await service.register({
        email: 'bob@test.com',
        password: 'StrongP4ss!',
      });

      const token = store.users.get(id)!.emailVerifyToken;
      const result = await service.verifyEmail(token);

      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(store.users.get(id)!.emailVerified).toBe(true);
      expect(store.users.get(id)!.emailVerifyToken).toBeNull();
    });

    it('rejects invalid token', async () => {
      await service.register({ email: 'bob@test.com', password: 'StrongP4ss!' });

      await expect(service.verifyEmail('bogus-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects already-verified user token', async () => {
      const { id } = await service.register({
        email: 'bob@test.com',
        password: 'StrongP4ss!',
      });
      const token = store.users.get(id)!.emailVerifyToken;
      await service.verifyEmail(token);

      await expect(service.verifyEmail(token)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Login ──────────────────────────────────────────────────

  describe('login', () => {
    beforeEach(async () => {
      // Seed a first user so test users are not auto-verified admin
      await service.register({ email: 'seed-login@test.com', password: 'SeedP4ss!' });
    });

    it('returns tokens for verified user with correct password', async () => {
      const { id } = await service.register({
        email: 'carol@test.com',
        password: 'StrongP4ss!',
      });

      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      const tokens = (await service.login({
        email: 'carol@test.com',
        password: 'StrongP4ss!',
      })) as { accessToken: string; refreshToken: string; expiresAt: Date };

      expect(tokens.accessToken).toBe('jwt-access-token');
      expect(tokens.refreshToken).toBeDefined();
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.refreshToken.length).toBeGreaterThan(10);
      expect(tokens.expiresAt).toBeDefined();
    });

    it('rejects wrong password', async () => {
      const { id } = await service.register({
        email: 'carol@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      await expect(
        service.login({ email: 'carol@test.com', password: 'WrongP4ss!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects non-existent email', async () => {
      await expect(
        service.login({ email: 'ghost@test.com', password: 'StrongP4ss!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects unverified email', async () => {
      await service.register({ email: 'dave@test.com', password: 'StrongP4ss!' });

      await expect(
        service.login({ email: 'dave@test.com', password: 'StrongP4ss!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns requires2fa when TOTP is enabled', async () => {
      const { id } = await service.register({
        email: 'eve@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      // Enable 2FA — generate secret first
      const { secret } = await service.generate2faSecret(id);
      await service.enable2fa(id, { token: secret });

      const result = await service.login({
        email: 'eve@test.com',
        password: 'StrongP4ss!',
      });
      expect(result).toEqual({ requires2fa: true, userId: id });
    });
  });

  // ─── 2FA ────────────────────────────────────────────────────

  describe('2FA', () => {
    let userId: string;

    beforeEach(async () => {
      // Seed a first user so fiona is not auto-verified admin
      await service.register({ email: 'seed-2fa@test.com', password: 'SeedP4ss!' });

      const { id } = await service.register({
        email: 'fiona@test.com',
        password: 'StrongP4ss!',
      });
      userId = id;
      const user = store.users.get(userId)!;
      await service.verifyEmail(user.emailVerifyToken);
    });

    it('generate2faSecret returns secret, QR code, and URI', async () => {
      const result = await service.generate2faSecret(userId);
      expect(result).toHaveProperty('secret', 'JBSWY3DPEHPK3PXP');
      expect(result).toHaveProperty('qrCode');
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(result).toHaveProperty('otpauthUrl');
      expect(result.otpauthUrl).toContain('otpauth://');
    });

    it('enable2fa sets totpSecret and totpEnabled', async () => {
      const { secret } = await service.generate2faSecret(userId);
      await service.enable2fa(userId, { token: secret });

      const user = store.users.get(userId);
      expect(user.totpEnabled).toBe(true);
      expect(user.totpSecret).toBe(secret);
    });

    it('verify2fa returns tokens for a valid TOTP code after login with requires2fa', async () => {
      const { secret } = await service.generate2faSecret(userId);
      await service.enable2fa(userId, { token: secret });

      const tokens = await service.verify2fa(userId, { token: 'any-valid' });
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
    });

    it('disable2fa removes TOTP secret and disables flag', async () => {
      const { secret } = await service.generate2faSecret(userId);
      await service.enable2fa(userId, { token: secret });

      await service.disable2fa(userId, { token: secret });

      const user = store.users.get(userId);
      expect(user.totpEnabled).toBe(false);
      expect(user.totpSecret).toBeNull();
    });

    it('generate2faSecret rejects if 2FA already enabled', async () => {
      const { secret } = await service.generate2faSecret(userId);
      await service.enable2fa(userId, { token: secret });

      await expect(service.generate2faSecret(userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Token refresh ──────────────────────────────────────────

  describe('refreshToken', () => {
    beforeEach(async () => {
      await service.register({ email: 'seed-refresh@test.com', password: 'SeedP4ss!' });
    });

    it('rotates tokens and invalidates old session', async () => {
      const { id } = await service.register({
        email: 'grace@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      const first = (await service.login({
        email: 'grace@test.com',
        password: 'StrongP4ss!',
      })) as { accessToken: string; refreshToken: string; expiresAt: Date };

      expect(store.sessions.size).toBe(1);

      const rotated = await service.refreshToken(first.refreshToken);

      expect(rotated).toHaveProperty('accessToken');
      expect((rotated as any).refreshToken).not.toBe(first.refreshToken);
      // Old session deleted, new session created
      expect(store.sessions.size).toBe(1);
    });

    it('rejects expired session', async () => {
      const { id } = await service.register({
        email: 'grace@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      // Manually create an expired session in the store
      const expiredToken = 'expired-refresh-token';
      store.sessions.set('expired-session', {
        id: 'expired-session',
        userId: id,
        refreshToken: expiredToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refreshToken(expiredToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects non-existent refresh token', async () => {
      await expect(service.refreshToken('ghost-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── Logout ─────────────────────────────────────────────────

  describe('logout', () => {
    beforeEach(async () => {
      await service.register({ email: 'seed-logout@test.com', password: 'SeedP4ss!' });
    });

    it('deletes the session for the given refresh token', async () => {
      const { id } = await service.register({
        email: 'heidi@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      const tokens = (await service.login({
        email: 'heidi@test.com',
        password: 'StrongP4ss!',
      })) as { accessToken: string; refreshToken: string; expiresAt: Date };

      expect(store.sessions.size).toBe(1);

      await service.logout(tokens.refreshToken);
      expect(store.sessions.size).toBe(0);
    });

    it('succeeds silently for already-logged-out token', async () => {
      const result = await service.logout('already-deleted-token');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  // ─── Password reset ─────────────────────────────────────────

  describe('forgotPassword', () => {
    beforeEach(async () => {
      await service.register({ email: 'seed-forgot@test.com', password: 'SeedP4ss!' });
    });

    it('sends a reset link and returns generic message for existing user', async () => {
      const { id } = await service.register({
        email: 'ivan@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      const result = await service.forgotPassword({ email: 'ivan@test.com' });
      expect(result).toEqual({
        message: 'If that email exists, a reset link has been sent',
      });
    });

    it('returns same generic message for non-existent email (no info leak)', async () => {
      const result = await service.forgotPassword({
        email: 'nobody@test.com',
      });
      expect(result).toEqual({
        message: 'If that email exists, a reset link has been sent',
      });
    });
  });

  describe('resetPassword', () => {
    beforeEach(async () => {
      await service.register({ email: 'seed-reset@test.com', password: 'SeedP4ss!' });
    });

    it('changes password and invalidates all sessions', async () => {
      const { id } = await service.register({
        email: 'judy@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);

      // Login to create a session
      await service.login({ email: 'judy@test.com', password: 'StrongP4ss!' });
      expect(store.sessions.size).toBe(1);

      // Capture the raw reset token from the mail service mock
      await service.forgotPassword({ email: 'judy@test.com' });
      const sentCalls = mockMailService.send.mock.calls;
      const sentCall = sentCalls[sentCalls.length - 1][0];
      const rawToken = sentCall.text.split('?token=')[1];

      const result = await service.resetPassword({
        token: rawToken,
        password: 'NewStrongP4ss!',
      });
      expect(result).toEqual({ message: 'Password reset successfully' });

      // Old session was deleted
      expect(store.sessions.size).toBe(0);

      // Can login with new password
      const tokens = await service.login({
        email: 'judy@test.com',
        password: 'NewStrongP4ss!',
      });
      expect(tokens).toHaveProperty('accessToken');

      // Old password no longer works
      await expect(
        service.login({ email: 'judy@test.com', password: 'StrongP4ss!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects invalid reset token', async () => {
      await expect(
        service.resetPassword({ token: 'bogus', password: 'NewStrongP4ss!' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Audit log compliance ───────────────────────────────────

  describe('audit logs', () => {
    beforeEach(async () => {
      await service.register({ email: 'seed-audit@test.com', password: 'SeedP4ss!' });
    });

    it('register writes audit log inside $transaction', async () => {
      mockAuditLogCreate.mockClear();
      await service.register({ email: 'audit-reg@test.com', password: 'StrongP4ss!' });
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'register',
          resource: 'user',
        }),
      });
    });

    it('verifyEmail writes audit log inside $transaction', async () => {
      const { id } = await service.register({ email: 'audit-ve@test.com', password: 'StrongP4ss!' });
      const token = store.users.get(id)!.emailVerifyToken;
      mockAuditLogCreate.mockClear();
      await service.verifyEmail(token);
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'verify-email',
          resource: 'user',
        }),
      });
    });

    it('enable2fa writes audit log inside $transaction', async () => {
      const { id } = await service.register({ email: 'audit-e2fa@test.com', password: 'StrongP4ss!' });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);
      const { secret } = await service.generate2faSecret(id);
      mockAuditLogCreate.mockClear();
      await service.enable2fa(id, { token: secret });
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'enable-2fa',
          resource: 'user',
        }),
      });
    });

    it('disable2fa writes audit log inside $transaction', async () => {
      const { id } = await service.register({ email: 'audit-d2fa@test.com', password: 'StrongP4ss!' });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);
      const { secret } = await service.generate2faSecret(id);
      await service.enable2fa(id, { token: secret });
      mockAuditLogCreate.mockClear();
      await service.disable2fa(id, { token: secret });
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'disable-2fa',
          resource: 'user',
        }),
      });
    });

    it('forgotPassword writes audit log inside $transaction', async () => {
      mockAuditLogCreate.mockClear();
      await service.forgotPassword({ email: 'seed-audit@test.com' });
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'forgot-password',
          resource: 'user',
        }),
      });
    });

    it('resetPassword writes audit log inside $transaction', async () => {
      const { id } = await service.register({ email: 'audit-rp@test.com', password: 'StrongP4ss!' });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);
      await service.forgotPassword({ email: 'audit-rp@test.com' });
      const sentCalls = mockMailService.send.mock.calls;
      const sentCall = sentCalls[sentCalls.length - 1][0];
      const rawToken = sentCall.text.split('?token=')[1];
      mockAuditLogCreate.mockClear();
      await service.resetPassword({ token: rawToken, password: 'NewP4ss!' });
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'reset-password',
          resource: 'user',
        }),
      });
    });

    it('logout writes audit log inside $transaction', async () => {
      const { id } = await service.register({ email: 'audit-lo@test.com', password: 'StrongP4ss!' });
      const user = store.users.get(id)!;
      await service.verifyEmail(user.emailVerifyToken);
      const tokens = (await service.login({ email: 'audit-lo@test.com', password: 'StrongP4ss!' })) as any;
      mockAuditLogCreate.mockClear();
      await service.logout(tokens.refreshToken);
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'logout',
          resource: 'session',
        }),
      });
    });
  });

  // ─── Full happy-path flow ───────────────────────────────────

  describe('full flow', () => {
    beforeEach(async () => {
      await service.register({ email: 'seed-flow@test.com', password: 'SeedP4ss!' });
    });

    it('completes a full register → verify → login → refresh → logout flow', async () => {
      // 1. Register
      const reg = await service.register({
        email: 'zoe@test.com',
        password: 'StrongP4ss!',
      });
      expect(reg.email).toBe('zoe@test.com');

      // 2. Verify email
      const user = store.users.get(reg.id)!;
      await service.verifyEmail(user.emailVerifyToken);

      // 3. Login
      const loginResult = (await service.login({
        email: 'zoe@test.com',
        password: 'StrongP4ss!',
      })) as { accessToken: string; refreshToken: string; expiresAt: Date };
      expect(loginResult.accessToken).toBeDefined();
      const oldRefresh = loginResult.refreshToken;

      // 4. Refresh
      const rotated = await service.refreshToken(oldRefresh);
      expect(rotated.refreshToken).not.toBe(oldRefresh);

      // 5. Old refresh is now invalid
      await expect(service.refreshToken(oldRefresh)).rejects.toThrow(
        UnauthorizedException,
      );

      // 6. Logout with new refresh
      await service.logout(rotated.refreshToken);
      await expect(service.refreshToken(rotated.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('completes a full 2FA enable → login with requires2fa → verify2fa flow', async () => {
      // 1. Register & verify
      const reg = await service.register({
        email: 'yuki@test.com',
        password: 'StrongP4ss!',
      });
      const user = store.users.get(reg.id)!;
      await service.verifyEmail(user.emailVerifyToken);

      // 2. Generate & enable 2FA
      const { secret } = await service.generate2faSecret(reg.id);
      await service.enable2fa(reg.id, { token: secret });

      // 3. Login — requires 2FA
      const step1 = await service.login({
        email: 'yuki@test.com',
        password: 'StrongP4ss!',
      });
      expect(step1).toEqual({ requires2fa: true, userId: reg.id });

      // 4. Verify 2FA — get full tokens
      const step2 = await service.verify2fa(reg.id, { token: 'any-valid' });
      expect(step2).toHaveProperty('accessToken');
      expect(step2).toHaveProperty('refreshToken');
    });
  });
});
