import { Test, TestingModule } from '@nestjs/testing';
import { OAuthService } from './oauth.service';
import { OAuthRepository } from './oauth.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('OAuthService', () => {
  let service: OAuthService;
  let mockRepo: any;
  let mockPrisma: any;

  const clients = new Map<string, any>();
  const codes = new Map<string, any>();

  beforeEach(async () => {
    clients.clear();
    codes.clear();

    mockRepo = {
      createClient: jest.fn(async (data: any) => {
        const client = { id: `client-${clients.size + 1}`, ...data, createdAt: new Date() };
        clients.set(client.id, client);
        return client;
      }),
      findClientById: jest.fn(async (id: string) => clients.get(id) ?? null),
      findClientsByUserId: jest.fn(async (userId: string) =>
        Array.from(clients.values()).filter((c: any) => c.userId === userId),
      ),
      deleteClient: jest.fn(async (id: string) => { clients.delete(id); }),
      createAuthorizationCode: jest.fn(async (data: any) => {
        const code = { id: `code-${codes.size + 1}`, ...data };
        codes.set(code.id, code);
        return code;
      }),
      findAuthorizationCode: jest.fn(async (code: string) =>
        Array.from(codes.values()).find((c: any) => c.code === code) ?? null,
      ),
      markAuthorizationCodeUsed: jest.fn(async (id: string) => {
        const c = codes.get(id);
        if (c) codes.set(id, { ...c, used: true });
      }),
      deleteAuthorizationCodesByClient: jest.fn(async (clientId: string) => {
        for (const [id, c] of codes) {
          if (c.clientId === clientId) codes.delete(id);
        }
      }),
    };

    mockPrisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: OAuthRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
  });

  describe('client CRUD', () => {
    it('registers a client with a secret', async () => {
      const client = await service.registerClient('user-1', 'My App', ['http://localhost:3000/callback']);
      expect(client.id).toBeDefined();
      expect(client.name).toBe('My App');
      expect(client.clientSecret).toMatch(/^[a-f0-9]{64}$/);
    });

    it('lists user clients', async () => {
      await service.registerClient('user-1', 'A', ['http://a.com']);
      await service.registerClient('user-1', 'B', ['http://b.com']);
      const list = await service.listClients('user-1');
      expect(list).toHaveLength(2);
    });

    it('deletes own client with audit log', async () => {
      const client = await service.registerClient('user-1', 'My App', ['http://localhost/callback']);
      const result = await service.deleteClient('user-1', client.id);
      expect(result.success).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'oauth.client.delete' }) }),
      );
    });

    it('throws when deleting another user client', async () => {
      const client = await service.registerClient('user-1', 'My App', ['http://localhost/callback']);
      await expect(service.deleteClient('user-2', client.id)).rejects.toThrow('Client not found');
    });
  });

  describe('authorization', () => {
    it('returns consent info for valid client', async () => {
      clients.set('client-1', {
        id: 'client-1',
        name: 'Test App',
        redirectUris: ['http://localhost/callback'],
        logo: null,
      });
      const info = await service.authorize('client-1', 'http://localhost/callback', 'read', null, null, null);
      expect(info.clientName).toBe('Test App');
    });

    it('throws for unmatched redirect URI', async () => {
      clients.set('client-1', { id: 'client-1', name: 'Test', redirectUris: ['http://localhost/callback'] });
      await expect(
        service.authorize('client-1', 'http://evil.com/callback', 'read', null, null, null),
      ).rejects.toThrow('Redirect URI not registered');
    });

    it('throws for unknown client', async () => {
      await expect(
        service.authorize('nonexistent', 'http://localhost/callback', 'read', null, null, null),
      ).rejects.toThrow('OAuth client not found');
    });
  });

  describe('consent', () => {
    it('approves consent and returns redirect with code', async () => {
      clients.set('client-1', {
        id: 'client-1',
        name: 'Test',
        redirectUris: ['http://localhost/callback'],
        userId: 'user-1',
      });
      const result = await service.approveConsent(
        'user-1', 'client-1', 'http://localhost/callback', 'read', null, null, null,
      );
      expect(result.redirectUrl).toContain('code=');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'oauth.authorize' }) }),
      );
    });

    it('denies consent and returns redirect with error', async () => {
      const result = await service.denyConsent('client-1', 'http://localhost/callback', 'state123');
      expect(result.redirectUrl).toContain('error=access_denied');
      expect(result.redirectUrl).toContain('state=state123');
    });
  });

  describe('token exchange', () => {
    beforeEach(() => {
      clients.set('client-1', {
        id: 'client-1',
        name: 'Test',
        clientSecret: 'secret123',
        redirectUris: ['http://localhost/callback'],
      });
    });

    it('exchanges code for token', async () => {
      codes.set('code-1', {
        id: 'code-1',
        code: 'auth-code',
        clientId: 'client-1',
        userId: 'user-1',
        scopes: 'read',
        redirectUri: 'http://localhost/callback',
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
        codeChallenge: null,
        codeChallengeMethod: null,
      });
      const result = await service.token('auth-code', 'client-1', 'secret123', 'http://localhost/callback');
      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
    });

    it('rejects used code', async () => {
      codes.set('code-1', {
        id: 'code-1', code: 'used-code', clientId: 'client-1', userId: 'user-1',
        scopes: 'read', redirectUri: 'http://localhost/callback', used: true,
        expiresAt: new Date(Date.now() + 60_000), codeChallenge: null, codeChallengeMethod: null,
      });
      await expect(service.token('used-code', 'client-1', 'secret123', 'http://localhost/callback'))
        .rejects.toThrow('already used');
    });

    it('rejects expired code', async () => {
      codes.set('code-1', {
        id: 'code-1', code: 'expired', clientId: 'client-1', userId: 'user-1',
        scopes: 'read', redirectUri: 'http://localhost/callback', used: false,
        expiresAt: new Date(Date.now() - 60_000), codeChallenge: null, codeChallengeMethod: null,
      });
      await expect(service.token('expired', 'client-1', 'secret123', 'http://localhost/callback'))
        .rejects.toThrow('expired');
    });

    it('rejects invalid client secret', async () => {
      await expect(service.token('code', 'client-1', 'wrong-secret', 'http://localhost/callback'))
        .rejects.toThrow('Invalid client secret');
    });
  });

  describe('PKCE', () => {
    it('rejects missing code verifier when challenge is set', async () => {
      clients.set('pkce-client', {
        id: 'pkce-client', name: 'PKCE', clientSecret: 'secret',
        redirectUris: ['http://localhost/callback'],
      });
      codes.set('code-pkce', {
        id: 'code-pkce', code: 'pkce-code', clientId: 'pkce-client', userId: 'user-1',
        scopes: 'read', redirectUri: 'http://localhost/callback', used: false,
        expiresAt: new Date(Date.now() + 60_000),
        codeChallenge: 'challenge', codeChallengeMethod: 'S256',
      });
      await expect(service.token('pkce-code', 'pkce-client', 'secret', 'http://localhost/callback'))
        .rejects.toThrow('Code verifier required');
    });
  });
});
