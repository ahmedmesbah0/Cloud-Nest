import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class IdempotencyKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findByKey(key: string, tx?: PrismaTx) {
    return this.db(tx).idempotencyKey.findUnique({ where: { key } });
  }

  async create(data: { key: string; action: string; status: string }, tx?: PrismaTx) {
    return this.db(tx).idempotencyKey.create({ data });
  }

  async updateStatus(key: string, status: string, completedAt?: Date, tx?: PrismaTx) {
    return this.db(tx).idempotencyKey.update({
      where: { key },
      data: { status, ...(completedAt ? { completedAt } : {}) },
    });
  }
}
