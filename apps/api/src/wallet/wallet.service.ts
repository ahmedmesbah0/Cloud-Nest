import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletRepository } from './wallet.repository';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletRepo: WalletRepository,
    private readonly jobService: ProxmoxJobService,
  ) {}

  async getOrCreateWallet(userId: string) {
    let wallet = await this.walletRepo.findByUser(userId);
    if (!wallet) {
      wallet = await this.walletRepo.create({ userId });
    }
    return wallet;
  }

  async getWallet(userId: string) {
    const wallet = await this.walletRepo.findByUser(userId, true);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async credit(userId: string, amount: number, reference?: string, metadata?: Record<string, unknown>) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const txRecord = await this.prisma.$transaction(async (tx: any) => {
      let wallet = await this.walletRepo.findByUser(userId, false, tx);
      if (!wallet) {
        wallet = await this.walletRepo.create({ userId }, tx);
      }

      await this.walletRepo.update(userId, { balance: { increment: amount } }, tx);

      const record = await this.walletRepo.createTransaction({
        walletId: wallet.id,
        amount,
        type: 'credit',
        reference,
        metadata: (metadata ?? {}) as any,
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'wallet.credit',
          resource: 'wallet',
          resourceId: wallet.id,
          metadata: { amount, reference, balanceAfter: (wallet.balance + amount) } as any,
        },
      });

      return record;
    });

    await this.autoResumeSuspendedVms(userId);

    return txRecord;
  }

  private async autoResumeSuspendedVms(userId: string) {
    try {
      const suspendedVms = await this.prisma.vm.findMany({
        where: { userId, status: 'suspended', proxmoxId: { not: null } },
        include: { subscription: true },
      });

      for (const vm of suspendedVms) {
        if (vm.subscription?.status !== 'grace_period') continue;

        await this.jobService.enqueueJob('resume-vm', {
          vmId: vm.id,
          proxmoxId: vm.proxmoxId,
          node: vm.nodeId,
        }, {
          userId,
          auditLog: { action: 'vm.resume.auto-payment', resource: 'vm', resourceId: vm.id },
        });

        this.logger.log(`Auto-resume queued for VM ${vm.id} (user ${userId} added funds)`);
      }
    } catch (error) {
      this.logger.error(`Auto-resume check failed for user ${userId}: ${(error as Error).message}`);
    }
  }

  async debit(userId: string, amount: number, reference?: string, metadata?: Record<string, unknown>) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.prisma.$transaction(async (tx: any) => {
      let wallet = await this.walletRepo.findByUser(userId, false, tx);
      if (!wallet) {
        wallet = await this.walletRepo.create({ userId }, tx);
      }

      if (wallet.balance < amount) {
        throw new BadRequestException(
          `Insufficient balance: have ${wallet.balance} cents, need ${amount} cents`,
        );
      }

      await this.walletRepo.update(userId, { balance: { decrement: amount } }, tx);

      const txRecord = await this.walletRepo.createTransaction({
        walletId: wallet.id,
        amount: -amount,
        type: 'debit',
        reference,
        metadata: (metadata ?? {}) as any,
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'wallet.debit',
          resource: 'wallet',
          resourceId: wallet.id,
          metadata: { amount, reference, balanceAfter: (wallet.balance - amount) } as any,
        },
      });

      return txRecord;
    });
  }

  async listTransactions(userId: string, limit = 50) {
    const wallet = await this.getOrCreateWallet(userId);
    return this.walletRepo.findTransactions(wallet.id, limit);
  }
}
