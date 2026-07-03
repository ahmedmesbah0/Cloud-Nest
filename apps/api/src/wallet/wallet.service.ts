import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }
    return wallet;
  }

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async credit(userId: string, amount: number, reference?: string, metadata?: Record<string, unknown>) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId } });
      }

      await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });

      const txRecord = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'credit',
          reference,
          metadata: (metadata ?? {}) as any,
        },
      });

      return txRecord;
    });
  }

  async debit(userId: string, amount: number, reference?: string, metadata?: Record<string, unknown>) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId } });
      }

      if (wallet.balance < amount) {
        throw new BadRequestException(
          `Insufficient balance: have ${wallet.balance} cents, need ${amount} cents`,
        );
      }

      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      const txRecord = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: -amount,
          type: 'debit',
          reference,
          metadata: (metadata ?? {}) as any,
        },
      });

      return txRecord;
    });
  }

  async listTransactions(userId: string, limit = 50) {
    const wallet = await this.getOrCreateWallet(userId);
    return this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
