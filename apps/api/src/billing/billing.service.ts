import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingRepository } from './billing.repository';
import { WalletService } from '../wallet/wallet.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxService } from '../proxmox/proxmox.service';

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
    private readonly billingRepo: BillingRepository,
    private readonly walletService: WalletService,
    private readonly jobService: ProxmoxJobService,
    private readonly poolService: ResourcePoolService,
    private readonly proxmox: ProxmoxService,
  ) {}

  async runHourlyBilling(): Promise<{ billed: number; suspended: number; deleted: number }> {
    const result = { billed: 0, suspended: 0, deleted: 0 };

    const activeVms = await this.billingRepo.findVmsByStatus(['running', 'stopped']);

    for (const vm of activeVms) {
      try {
        await this.billVm(vm.id);
        result.billed++;
      } catch (error) {
        this.logger.error(`Failed to bill VM ${vm.id}: ${(error as Error).message}`);
      }
    }

    const suspendedVms = await this.billingRepo.findVmsByStatus(['suspended']);

    for (const vm of suspendedVms) {
      const suspendedAt = vm.suspendedAt ?? vm.updatedAt;
      const hoursSinceSuspend = (Date.now() - suspendedAt.getTime()) / 3600000;
      if (hoursSinceSuspend > DELETION_SCHEDULE_HOURS) {
        try {
          await this.scheduleDeletion(vm.id);
          result.deleted++;
        } catch (error) {
          this.logger.error(`Failed to schedule deletion for VM ${vm.id}: ${(error as Error).message}`);
        }
      }
    }

    return result;
  }

  private async billVm(vmId: string) {
    const vm = await this.billingRepo.findVmById(vmId);
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
      return;
    }

    const today = new Date();
    today.setMinutes(0, 0, 0);
    const periodStart = new Date(today.getTime() - 3600000);
    const periodEnd = today;

    const description = `VM "${vm.name}" hourly — ${periodStart.toISOString().slice(0, 16)} to ${periodEnd.toISOString().slice(0, 16)}`;

    await this.createInvoice(vm.userId, hourlyCost, [
      {
        description: `${description} (${vm.cpuCores} vCPU, ${Math.ceil(vm.memoryMb / 1024)} GB RAM, ${vm.diskGb} GB disk)`,
        quantity: 1,
        unitPrice: hourlyCost,
        total: hourlyCost,
      },
    ]);

    this.logger.log(`Billed VM ${vmId}: ${hourlyCost} cents`);
  }

  private async createInvoice(
    userId: string,
    amount: number,
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  ) {
    await this.prisma.$transaction(async (tx: any) => {
      const invoice = await this.billingRepo.createInvoice({
        userId,
        amount,
        status: 'paid',
        paidAt: new Date(),
        lineItems: {
          create: lineItems,
        },
      }, tx);

      const wallet = await this.billingRepo.findWalletByUser(userId, tx);
      if (wallet) {
        await this.billingRepo.updateTransactions(
          {
            walletId: wallet.id,
            amount: -amount,
            invoiceId: null,
            type: 'debit',
          },
          { invoiceId: invoice.id },
          tx,
        );
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'invoice.create',
          resource: 'invoice',
          resourceId: invoice.id,
          metadata: { amount, lineItemCount: lineItems.length } as any,
        },
      });

      return invoice;
    });
  }

  private calculateHourlyCost(cores: number, memoryMb: number, diskGb: number): number {
    return (
      cores * VM_PRICE_PER_CORE_HOUR +
      Math.ceil(memoryMb / 1024) * VM_PRICE_PER_GB_MEM_HOUR +
      diskGb * VM_PRICE_PER_GB_DISK_HOUR
    );
  }

  async enterGracePeriod(vmId: string) {
    const vm = await this.billingRepo.findVmById(vmId);
    if (!vm) return;

    await this.prisma.$transaction(async (tx: any) => {
      await this.billingRepo.updateVm(vmId, { status: 'suspended', suspendedAt: new Date() }, tx);

      await tx.auditLog.create({
        data: {
          userId: vm.userId,
          action: 'vm.suspend',
          resource: 'vm',
          resourceId: vmId,
          metadata: { reason: 'insufficient_balance', graceHours: GRACE_PERIOD_HOURS },
        },
      });
    });

    this.logger.log(`VM ${vmId} suspended due to insufficient balance`);
  }

  async scheduleDeletion(vmId: string) {
    const vm = await this.billingRepo.findVmById(vmId);
    if (!vm) return;

    await this.prisma.$transaction(async (tx: any) => {
      await this.billingRepo.updateVm(vmId, { status: 'scheduled_deletion' }, tx);

      await tx.auditLog.create({
        data: {
          userId: vm.userId,
          action: 'vm.schedule-deletion',
          resource: 'vm',
          resourceId: vmId,
          metadata: { reason: 'grace_period_expired' },
        },
      });
    });

    if (vm.proxmoxId) {
      await this.jobService.enqueueJob('delete-vm', {
        vmId: vm.id,
        proxmoxId: vm.proxmoxId,
        node: vm.nodeId,
      }, {
        userId: vm.userId,
        auditLog: { action: 'vm.delete.billing', resource: 'vm', resourceId: vm.id },
      });
    } else {
      await this.poolService.releaseResources(vm.id);
      await this.billingRepo.updateVm(vmId, { status: 'deleted' });
    }

    this.logger.log(`VM ${vmId} deletion scheduled/queued`);
  }

  async reconcile(): Promise<{ checked: number; fixed: number; errors: string[] }> {
    const result = { checked: 0, fixed: 0, errors: [] as string[] };

    const dbVms = await this.billingRepo.findVmsByStatus(['running', 'stopped', 'suspended']);

    for (const vm of dbVms) {
      result.checked++;
      if (!vm.proxmoxId || !vm.nodeId) continue;

      try {
        const nodeRecord = await this.billingRepo.findNodeById(vm.nodeId);
        if (!nodeRecord) continue;

        const status = await this.proxmox.getVmStatus(nodeRecord.proxmoxNodeId, vm.proxmoxId);

        let desiredStatus: string | null = null;
        if (status.status === 'running' && vm.status !== 'running' && vm.status !== 'stopped') {
          desiredStatus = 'running';
        } else if (status.status === 'stopped' && vm.status === 'running') {
          desiredStatus = 'stopped';
        } else if (status.status === 'stopped' && vm.status === 'suspended') {
          desiredStatus = 'suspended';
        }

        if (desiredStatus && desiredStatus !== vm.status) {
          await this.billingRepo.updateVm(vm.id, { status: desiredStatus as any });
          result.fixed++;
          this.logger.warn(`Reconciled VM ${vm.id}: DB was ${vm.status}, Proxmox says ${status.status}, set to ${desiredStatus}`);
        }
      } catch (error) {
        result.errors.push(`VM ${vm.id}: ${(error as Error).message}`);
      }
    }

    return result;
  }

  async getVmBillingEstimate(vmId: string): Promise<{ hourlyCost: number; dailyCost: number; monthlyCost: number }> {
    const vm = await this.billingRepo.findVmById(vmId);
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
    return this.billingRepo.findTransactions(
      {
        walletId: wallet.id,
        type: 'debit',
        reference: { contains: ':hourly' },
      },
      { createdAt: 'desc' },
      limit,
    );
  }

  async listInvoices(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const { invoices, total } = await this.billingRepo.findInvoices(userId, skip, limit);
    return { invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getInvoice(userId: string, invoiceId: string) {
    const invoice = await this.billingRepo.findInvoiceById(invoiceId, {
      lineItems: true,
      transaction: true,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.userId !== userId) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async getInvoicePdf(invoiceId: string, userId: string) {
    const invoice = await this.billingRepo.findInvoiceById(invoiceId, {
      lineItems: true,
      user: { select: { name: true, email: true } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.userId !== userId) throw new ForbiddenException('Not your invoice');

    return {
      id: invoice.id,
      createdAt: invoice.createdAt,
      amount: invoice.amount,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      lineItems: invoice.lineItems,
      customer: invoice.user,
    };
  }

  async getAdminInvoicePdf(invoiceId: string) {
    const invoice = await this.billingRepo.findInvoiceById(invoiceId, {
      lineItems: true,
      user: { select: { name: true, email: true } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return {
      ...invoice,
      customer: invoice.user,
    };
  }
}
