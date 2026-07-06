import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PasskeysService } from './passkeys.service';
import { PasskeysRepository } from './passkeys.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('PasskeysService', () => {
  let service: PasskeysService;
  let mockRepo: any;
  let mockPrisma: any;
  let mockConfig: any;
  let mockJwt: any;

  const store = { passkeys: new Map<string, any>(), users: new Map<string, any>() };
  let passkeyCounter = 0;

  beforeEach(async () => {
    store.passkeys.clear();
    store.users.clear();
    passkeyCounter = 0;

    mockRepo = {
      findByUserId: jest.fn(async (userId: string) =>
        Array.from(store.passkeys.values()).filter((k: any) => k.userId === userId),
      ),
      findById: jest.fn(async (id: string) => store.passkeys.get(id) ?? null),
      findByCredentialId: jest.fn(async (credentialId: string) =>
        Array.from(store.passkeys.values()).find((k: any) => k.credentialId === credentialId) ?? null,
      ),
      create: jest.fn(async (data: any) => {
        passkeyCounter++;
        const passkey = { id: `pk-${passkeyCounter}`, ...data, createdAt: new Date() };
        store.passkeys.set(passkey.id, passkey);
        return passkey;
      }),
      updateCounter: jest.fn(async (id: string, counter: number) => {
        const k = store.passkeys.get(id);
        if (k) store.passkeys.set(id, { ...k, counter });
      }),
      delete: jest.fn(async (id: string) => {
        store.passkeys.delete(id);
      }),
    };

    mockConfig = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'TOTP_ISSUER') return 'CloudNest';
        if (key === 'WEBAUTHN_RP_ID') return 'localhost';
        if (key === 'WEBAUTHN_ORIGIN') return 'http://localhost:3000';
        return def;
      }),
    };

    mockJwt = {
      sign: jest.fn(() => 'mock-access-token'),
    };

    mockPrisma = {
      user: {
        findUnique: jest.fn(async ({ where: { id } }: any) => store.users.get(id) ?? null),
        update: jest.fn(async ({ where: { id }, data }: any) => {
          const u = store.users.get(id);
          if (u) store.users.set(id, { ...u, ...data });
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasskeysService,
        { provide: PasskeysRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<PasskeysService>(PasskeysService);
    // Set up mock webauthn module after construction
    (service as any).webauthn = {
      generateRegistrationOptions: jest.fn().mockResolvedValue({
        challenge: 'mock-challenge',
        rp: { name: 'CloudNest', id: 'localhost' },
        user: { id: 'user-1', name: 'test' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        excludeCredentials: [],
      }),
      verifyRegistrationResponse: jest.fn().mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-id-123',
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
          },
        },
      }),
      generateAuthenticationOptions: jest.fn().mockResolvedValue({
        challenge: 'auth-challenge',
        allowCredentials: [],
      }),
      verifyAuthenticationResponse: jest.fn().mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      }),
    };
  });

  describe('registration', () => {
    it('generates registration options', async () => {
      store.users.set('user-1', { id: 'user-1', email: 'test@test.com' });
      const options = await service.generateRegistrationOptions('user-1', 'test');
      expect(options.challenge).toBe('mock-challenge');
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('verifies registration and creates passkey', async () => {
      store.users.set('user-1', { id: 'user-1', currentChallenge: 'mock-challenge', email: 'test@test.com' });
      const result = await service.verifyRegistration(
        'user-1',
        { response: { transports: ['internal'] } } as any,
        'My Device',
      );
      expect(result.success).toBe(true);
      expect(result.deviceName).toBe('My Device');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'passkey.register' }) }),
      );
    });

    it('throws when no challenge stored', async () => {
      store.users.set('user-1', { id: 'user-1' });
      await expect(
        service.verifyRegistration('user-1', {} as any, 'Device'),
      ).rejects.toThrow('No registration challenge found');
    });

    it('lists passkeys for a user', async () => {
      store.users.set('user-1', { id: 'user-1' });
      mockRepo.create({ userId: 'user-1', credentialId: 'c1', publicKey: Buffer.from(''), counter: 0, deviceName: 'A' });
      const keys = await service.list('user-1');
      expect(keys).toHaveLength(1);
    });
  });

  describe('authentication', () => {
    it('generates authentication options', async () => {
      store.users.set('user-1', { id: 'user-1', email: 'test@test.com' });
      const options = await service.generateAuthenticationOptions('test@test.com');
      expect(options.challenge).toBe('auth-challenge');
    });

    it('verifies authentication and returns token', async () => {
      store.users.set('user-1', { id: 'user-1', currentChallenge: 'auth-challenge', email: 'test@test.com' });
      store.passkeys.set('pk-1', {
        id: 'pk-1',
        userId: 'user-1',
        credentialId: 'cred-1',
        publicKey: Buffer.from([1, 2, 3]),
        counter: 0,
        transports: '',
      });
      const result = await service.verifyAuthentication({ id: 'cred-1' } as any);
      expect(result.accessToken).toBe('mock-access-token');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'passkey.login' }) }),
      );
    });
  });

  describe('delete', () => {
    it('deletes own passkey with audit log', async () => {
      store.passkeys.set('pk-1', { id: 'pk-1', userId: 'user-1', credentialId: 'c1', deviceName: 'A' });
      const result = await service.delete('user-1', 'pk-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'passkey.delete' }) }),
      );
    });

    it('throws when deleting non-owned passkey', async () => {
      store.passkeys.set('pk-1', { id: 'pk-1', userId: 'user-2', credentialId: 'c1', deviceName: 'A' });
      await expect(service.delete('user-1', 'pk-1')).rejects.toThrow('Passkey not found');
    });
  });
});
