import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findByUser(userId: string, includeTransactions = false, tx?: PrismaTx) {
    return this.db(tx).wallet.findUnique({
      where: { userId },
      include: includeTransactions
        ? { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } }
        : undefined,
    });
  }

  async create(data: { userId: string }, tx?: PrismaTx) {
    return this.db(tx).wallet.create({ data });
  }

  async update(userId: string, data: any, tx?: PrismaTx) {
    return this.db(tx).wallet.update({ where: { userId }, data });
  }

  async updateMany(where: any, data: any, tx?: PrismaTx) {
    return this.db(tx).wallet.updateMany({ where, data });
  }

  async findTransactions(walletId: string, limit: number, tx?: PrismaTx) {
    return this.db(tx).transaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async createTransaction(data: {
    walletId: string;
    amount: number;
    type: string;
    reference?: string;
    metadata?: any;
  }, tx?: PrismaTx) {
    return this.db(tx).transaction.create({ data });
  }
}
