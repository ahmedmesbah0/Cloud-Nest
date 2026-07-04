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
      select: { id: true, name: true, key: true, lastUsedAt: true, createdAt: true },
    });
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).apiKey.findUnique({ where: { id } });
  }

  async create(data: { userId: string; name: string; key: string }, tx?: PrismaTx) {
    return this.db(tx).apiKey.create({ data });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).apiKey.delete({ where: { id } });
  }
}
