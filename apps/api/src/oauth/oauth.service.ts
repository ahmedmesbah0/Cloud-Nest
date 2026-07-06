import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthRepository } from './oauth.repository';

@Injectable()
export class OAuthService {
  constructor(
    private readonly oauthRepo: OAuthRepository,
    private readonly prisma: PrismaService,
  ) {}

  async registerClient(userId: string, name: string, redirectUris: string[], logo?: string) {
    const clientSecret = randomBytes(32).toString('hex');
    const scopes = 'read write';
    return this.oauthRepo.createClient({ userId, name, logo, redirectUris, scopes, clientSecret });
  }

  async listClients(userId: string) {
    return this.oauthRepo.findClientsByUserId(userId);
  }

  async deleteClient(userId: string, id: string) {
    const client = await this.oauthRepo.findClientById(id);
    if (!client || client.userId !== userId) throw new NotFoundException('Client not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.oauthRepo.deleteAuthorizationCodesByClient(id);
      await this.oauthRepo.deleteClient(id);
      await tx.auditLog.create({
        data: { userId, action: 'oauth.client.delete', resource: 'oauthClient', resourceId: id },
      });
    });
    return { success: true };
  }

  async authorize(
    clientId: string,
    redirectUri: string,
    scope: string,
    state: string | null,
    codeChallenge: string | null,
    codeChallengeMethod: string | null,
  ) {
    const client = await this.oauthRepo.findClientById(clientId);
    if (!client) throw new NotFoundException('OAuth client not found');

    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('Redirect URI not registered');
    }

    return {
      clientId: client.id,
      clientName: client.name,
      clientLogo: client.logo,
      scopes: scope || 'read',
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
    };
  }

  async approveConsent(
    userId: string,
    clientId: string,
    redirectUri: string,
    scope: string,
    state: string | null,
    codeChallenge: string | null,
    codeChallengeMethod: string | null,
  ) {
    const client = await this.oauthRepo.findClientById(clientId);
    if (!client) throw new NotFoundException('OAuth client not found');

    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('Redirect URI not registered');
    }

    const code = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.$transaction(async (tx: any) => {
      await this.oauthRepo.createAuthorizationCode({
        code,
        clientId,
        userId,
        scopes: scope || 'read',
        redirectUri,
        codeChallenge: codeChallenge ?? undefined,
        codeChallengeMethod: codeChallengeMethod ?? undefined,
        expiresAt,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'oauth.authorize',
          resource: 'oauthClient',
          resourceId: clientId,
          metadata: JSON.stringify({ scope, redirectUri }),
        },
      });
    });

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);
    return { redirectUrl: redirectUrl.toString() };
  }

  async denyConsent(_clientId: string, redirectUri: string, state: string | null) {
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('error_description', 'User denied consent');
    if (state) redirectUrl.searchParams.set('state', state);
    return { redirectUrl: redirectUrl.toString() };
  }

  async token(code: string, clientId: string, clientSecret: string, redirectUri: string, codeVerifier?: string) {
    const client = await this.oauthRepo.findClientById(clientId);
    if (!client) throw new UnauthorizedException('Invalid client');

    if (client.clientSecret !== clientSecret) {
      throw new UnauthorizedException('Invalid client secret');
    }

    const authCode = await this.oauthRepo.findAuthorizationCode(code);
    if (!authCode) throw new BadRequestException('Invalid authorization code');
    if (authCode.used) throw new ConflictException('Authorization code already used');
    if (authCode.expiresAt < new Date()) throw new BadRequestException('Authorization code expired');
    if (authCode.clientId !== clientId) throw new BadRequestException('Code-client mismatch');
    if (authCode.redirectUri !== redirectUri) throw new BadRequestException('Redirect URI mismatch');

    if (authCode.codeChallenge && authCode.codeChallengeMethod) {
      if (!codeVerifier) throw new BadRequestException('Code verifier required for PKCE');
      const expectedChallenge = authCode.codeChallengeMethod === 'S256'
        ? createHash('sha256').update(codeVerifier).digest('base64url')
        : codeVerifier;
      if (expectedChallenge !== authCode.codeChallenge) {
        throw new BadRequestException('Code verifier mismatch');
      }
    }

    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');

    await this.prisma.$transaction(async (tx: any) => {
      await this.oauthRepo.markAuthorizationCodeUsed(authCode.id);
      await tx.auditLog.create({
        data: {
          userId: authCode.userId,
          action: 'oauth.token',
          resource: 'oauthClient',
          resourceId: clientId,
        },
      });
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: authCode.scopes,
    };
  }
}
