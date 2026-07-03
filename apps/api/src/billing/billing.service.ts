import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

export type VmStatus = 'running' | 'stopped' | 'suspended' | 'provisioning' | 'error';
export type BillingState = 'active' | 'grace' | 'suspended' | 'scheduled_deletion' | 'deleted';

const VM_PRICE_PER_CORE_HOUR = 50;
const VM_PRICE_PER_GB_MEM_HOUR = 10;
const VM_PRICE_PER_GB_DISK_HOUR = 2;
const GRACE_PERIOD_HOURS = 24;
const DELETION_SCHEDULE_HOURS = 72;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  async runHourlyBilling(): Promise<{ billed: number; suspended: number; deleted: number }> {
    const result = { billed: 0, suspended: 0, deleted: 0 };

    const runningVms = await this.prisma.vm.findMany({
      where: { status: { in: ['running', 'stopped'] } },
      include: { user: true },
    });

    for (const vm of runningVms) {
      try {
        await this.billVm(vm.id);
        result.billed++;
      } catch (error) {
        this.logger.error(`Failed to bill VM ${vm.id}: ${(error as Error).message}`);
      }
    }

    const graceVms = await this.prisma.vm.findMany({
      where: { status: 'suspended' },
      include: { user: true },
    });

    for (const vm of graceVms) {
      try {
        const hoursSinceUpdate = (Date.now() - vm.updatedAt.getTime()) / 3600000;
        if (hoursSinceUpdate > DELETION_SCHEDULE_HOURS) {
          await this.scheduleDeletion(vm.id);
          result.deleted++;
        }
      } catch (error) {
        this.logger.error(`Failed to process VM ${vm.id} for deletion: ${(error as Error).message}`);
      }
    }

    return result;
  }

  private async billVm(vmId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm || vm.status === 'provisioning') return;

    const hourlyCost = this.calculateHourlyCost(vm.cpuCores, vm.memoryMb, vm.diskGb);

    try {
      await this.walletService.debit(vm.userId, hourlyCost, `vm:${vmId}:hourly`, {
        vmId: vm.id,
        cpuCores: vm.cpuCores,
        memoryMb: vm.memoryMb,
        diskGb: vm.diskGb,
      });
    } catch {
      this.logger.warn(`Insufficient balance for VM ${vmId}, entering grace period`);
      await this.enterGracePeriod(vmId);
    }
  }

  private calculateHourlyCost(cores: number, memoryMb: number, diskGb: number): number {
    return (
      cores * VM_PRICE_PER_CORE_HOUR +
      Math.ceil(memoryMb / 1024) * VM_PRICE_PER_GB_MEM_HOUR +
      diskGb * VM_PRICE_PER_GB_DISK_HOUR
    );
  }

  async enterGracePeriod(vmId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) return;

    await this.prisma.vm.update({
      where: { id: vmId },
      data: { status: 'suspended' },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: vm.userId,
        action: 'vm.suspend',
        resource: 'vm',
        resourceId: vmId,
        metadata: { reason: 'insufficient_balance', graceHours: GRACE_PERIOD_HOURS },
      },
    });

    this.logger.log(`VM ${vmId} suspended due to insufficient balance`);
  }

  async scheduleDeletion(vmId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) return;

    await this.prisma.auditLog.create({
      data: {
        userId: vm.userId,
        action: 'vm.schedule-deletion',
        resource: 'vm',
        resourceId: vmId,
        metadata: { reason: 'grace_period_expired' },
      },
    });

    this.logger.log(`VM ${vmId} scheduled for deletion`);
  }

  async getVmBillingEstimate(vmId: string): Promise<{ hourlyCost: number; dailyCost: number; monthlyCost: number }> {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new Error('VM not found');

    const hourly = this.calculateHourlyCost(vm.cpuCores, vm.memoryMb, vm.diskGb);
    return {
      hourlyCost: hourly,
      dailyCost: hourly * 24,
      monthlyCost: hourly * 730,
    };
  }

  async getUsageCharges(userId: string, limit = 100) {
    const wallet = await this.walletService.getOrCreateWallet(userId);
    return this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'debit',
        reference: { contains: ':hourly' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
