import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class SshKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findMany(userId: string, search?: string, tx?: PrismaTx) {
    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { publicKey: { contains: search, mode: 'insensitive' } },
        { fingerprint: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.db(tx).sshKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDeleted(userId: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.findMany({
      where: { userId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.findUnique({ where: { id } });
  }

  async create(data: { userId: string; name: string; publicKey: string; fingerprint?: string }, tx?: PrismaTx) {
    return this.db(tx).sshKey.create({ data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async hardDelete(id: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.delete({ where: { id } });
  }

  async updateFingerprint(id: string, fingerprint: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.update({
      where: { id },
      data: { fingerprint },
    });
  }
}
