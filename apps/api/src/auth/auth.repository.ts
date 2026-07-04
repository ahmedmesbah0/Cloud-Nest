import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findUserByEmail(email: string, tx?: PrismaTx) {
    return this.db(tx).user.findUnique({ where: { email } });
  }

  async findUserById(id: string, tx?: PrismaTx) {
    return this.db(tx).user.findUnique({ where: { id } });
  }

  async findUserProfile(id: string, tx?: PrismaTx) {
    return this.db(tx).user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, emailVerified: true, totpEnabled: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
  }

  async findUserByVerifyToken(token: string, tx?: PrismaTx) {
    return this.db(tx).user.findFirst({
      where: { emailVerifyToken: token, emailVerified: false },
    });
  }

  async findUserByResetToken(tokenHash: string, tx?: PrismaTx) {
    return this.db(tx).user.findFirst({
      where: { emailVerifyToken: tokenHash },
    });
  }

  async countUsers(tx?: PrismaTx) {
    return this.db(tx).user.count();
  }

  async countNewUsersSince(since: Date, tx?: PrismaTx) {
    return this.db(tx).user.count({ where: { createdAt: { gte: since } } });
  }

  async createUser(data: { email: string; passwordHash: string; name?: string | null; emailVerified: boolean }, tx?: PrismaTx) {
    return this.db(tx).user.create({ data });
  }

  async updateUser(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).user.update({ where: { id }, data });
  }

  async upsertRole(where: Record<string, unknown>, create: Record<string, unknown>, update: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).role.upsert({ where, create, update });
  }

  async createUserRole(data: { userId: string; roleId: string }, tx?: PrismaTx) {
    return this.db(tx).userRole.create({ data });
  }

  async createSession(data: { userId: string; refreshToken: string; expiresAt: Date }, tx?: PrismaTx) {
    return this.db(tx).session.create({ data });
  }

  async findSessionByRefreshToken(hashed: string, tx?: PrismaTx) {
    return this.db(tx).session.findUnique({ where: { refreshToken: hashed } });
  }

  async findSessionsByRefreshToken(hashed: string, tx?: PrismaTx) {
    return this.db(tx).session.findMany({
      where: { refreshToken: hashed },
      select: { userId: true },
    });
  }

  async deleteSession(id: string, tx?: PrismaTx) {
    return this.db(tx).session.delete({ where: { id } });
  }

  async deleteSessionsByRefreshToken(hashed: string, tx?: PrismaTx) {
    return this.db(tx).session.deleteMany({ where: { refreshToken: hashed } });
  }

  async deleteSessionsByUserId(userId: string, tx?: PrismaTx) {
    return this.db(tx).session.deleteMany({ where: { userId } });
  }
}
