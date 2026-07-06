import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class OAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async createClient(data: {
    userId: string;
    name: string;
    logo?: string;
    redirectUris: string[];
    scopes: string;
    clientSecret: string;
  }) {
    return this.db().oAuthClient.create({ data });
  }

  async findClientById(id: string) {
    return this.db().oAuthClient.findUnique({ where: { id } });
  }

  async findClientsByUserId(userId: string) {
    return this.db().oAuthClient.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteClient(id: string) {
    return this.db().oAuthClient.delete({ where: { id } });
  }

  async createAuthorizationCode(data: {
    code: string;
    clientId: string;
    userId: string;
    scopes: string;
    redirectUri: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    expiresAt: Date;
  }) {
    return this.db().oAuthAuthorizationCode.create({ data });
  }

  async findAuthorizationCode(code: string) {
    return this.db().oAuthAuthorizationCode.findUnique({ where: { code } });
  }

  async markAuthorizationCodeUsed(id: string) {
    return this.db().oAuthAuthorizationCode.update({
      where: { id },
      data: { used: true },
    });
  }

  async deleteAuthorizationCodesByClient(clientId: string) {
    return this.db().oAuthAuthorizationCode.deleteMany({ where: { clientId } });
  }
}
