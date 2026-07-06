import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class ApiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findMany(userId: string, tx?: PrismaTx) {
    return this.db(tx).apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        key: true,
        lastUsedAt: true,
        allowedIps: true,
        notifyForeignIp: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).apiKey.findUnique({ where: { id } });
  }

  async findByKey(key: string, tx?: PrismaTx) {
    return this.db(tx).apiKey.findUnique({ where: { key } });
  }

  async create(
    data: { userId: string; name: string; key: string; allowedIps: string | null; notifyForeignIp: boolean },
    tx?: PrismaTx,
  ) {
    return this.db(tx).apiKey.create({ data });
  }

  async update(
    id: string,
    data: { allowedIps?: string | null; notifyForeignIp?: boolean },
    tx?: PrismaTx,
  ) {
    return this.db(tx).apiKey.update({ where: { id }, data });
  }

  async updateLastUsed(id: string, tx?: PrismaTx) {
    return this.db(tx).apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).apiKey.delete({ where: { id } });
  }
}
