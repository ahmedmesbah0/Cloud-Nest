import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VmAddonsRepository } from './vm-addons.repository';
import { WalletService } from '../wallet/wallet.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';

const PRICING: Record<string, number> = {
  extra_disk: 50,
  extra_ip: 100,
  extra_backup_slots: 200,
  extra_snapshot_slots: 150,
  extra_bandwidth: 300,
};

@Injectable()
export class VmAddonsService {
  private readonly logger = new Logger(VmAddonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: VmAddonsRepository,
    private readonly walletService: WalletService,
    private readonly jobService: ProxmoxJobService,
  ) {}

  async getAddOns(vmId: string, userId: string) {
    const vm = await this.repo.findVm(vmId);
    if (!vm || vm.userId !== userId) throw new NotFoundException('VM not found');
    return this.repo.findByVm(vmId);
  }

  async purchaseAddOn(vmId: string, userId: string, dto: { type: string; quantity: number; priceCredits?: number }) {
    const vm = await this.repo.findVm(vmId);
    if (!vm || vm.userId !== userId) throw new NotFoundException('VM not found');

    const unitPrice = dto.priceCredits ?? PRICING[dto.type] ?? 100;
    const totalPrice = unitPrice * dto.quantity;

    await this.walletService.debit(userId, totalPrice, `addon:${vmId}:${dto.type}`, {
      vmId,
      type: dto.type,
      quantity: dto.quantity,
    });

    await this.prisma.$transaction(async (tx: any) => {
      await this.repo.create({
        vmId,
        type: dto.type,
        quantity: dto.quantity,
        priceCredits: totalPrice,
        metadata: { unitPrice, vmName: vm.name },
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'addon.purchase',
          resource: 'vm',
          resourceId: vmId,
          metadata: {
            type: dto.type,
            quantity: dto.quantity,
            priceCredits: totalPrice,
          },
        },
      });
    });

    await this.applyAddOnAction(vm, dto.type, dto.quantity);

    this.logger.log(`User ${userId} purchased ${dto.type}x${dto.quantity} for VM ${vmId}`);

    return { message: `Add-on ${dto.type} x${dto.quantity} purchased for ${totalPrice} credits`, totalPrice };
  }

  private async applyAddOnAction(vm: any, type: string, quantity: number) {
    switch (type) {
      case 'extra_disk':
        const newDisk = vm.diskGb + quantity;
        await this.jobService.enqueueJob('resize-vm', {
          vmId: vm.id,
          proxmoxId: vm.proxmoxId,
          node: vm.nodeId,
          cores: vm.cpuCores,
          memory: vm.memoryMb,
          disk: newDisk,
        }, {
          userId: vm.userId,
          auditLog: { action: 'vm.resize.addon-disk', resource: 'vm', resourceId: vm.id },
        });
        break;

      case 'extra_ip':
        await this.jobService.enqueueJob('update-vm-config', {
          vmId: vm.id,
          proxmoxId: vm.proxmoxId,
          node: vm.nodeId,
        }, {
          userId: vm.userId,
          auditLog: { action: 'vm.addon-ip', resource: 'vm', resourceId: vm.id },
        });
        break;

      default:
        this.logger.log(`Add-on ${type} requires no Proxmox action (config only)`);
    }
  }
}
