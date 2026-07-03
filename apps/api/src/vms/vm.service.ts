import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class VmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: ProxmoxJobService,
    private readonly poolService: ResourcePoolService,
  ) {}

  async createVm(userId: string, dto: {
    name: string;
    poolId: string;
    templateId: string;
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
    sshKeyId?: string;
  }) {
    const pool = await this.prisma.resourcePool.findUnique({
      where: { id: dto.poolId },
    });
    if (!pool) throw new BadRequestException('Resource pool not found');
    if (pool.userId !== userId) throw new ForbiddenException('Not your pool');

    const template = await this.prisma.vmTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template) throw new BadRequestException('Template not found');

    const vm = await this.prisma.$transaction(async (tx: any) => {
      const vm = await tx.vm.create({
        data: {
          userId,
          name: dto.name,
          status: 'provisioning',
          cpuCores: dto.cpuCores,
          memoryMb: dto.memoryMb,
          diskGb: dto.diskGb,
          templateId: dto.templateId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'vm.create',
          resource: 'vm',
          resourceId: vm.id,
          metadata: { name: dto.name, templateId: dto.templateId, cpuCores: dto.cpuCores, memoryMb: dto.memoryMb, diskGb: dto.diskGb },
        },
      });

      return vm;
    });

    await this.jobService.enqueueJob('create-vm', {
      vmId: vm.id,
      name: dto.name,
      cores: dto.cpuCores,
      memory: dto.memoryMb,
      disk: dto.diskGb,
      templateId: dto.templateId,
    }, {
      userId,
      auditLog: { action: 'vm.provision', resource: 'vm', resourceId: vm.id },
    });

    return vm;
  }

  async listVms(userId: string) {
    return this.prisma.vm.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');
    if (vm.userId !== userId) throw new ForbiddenException('Not your VM');
    return vm;
  }

  async performAction(userId: string, vmId: string, action: 'start' | 'stop' | 'restart' | 'shutdown') {
    const vm = await this.getVm(vmId, userId);

    if (vm.status !== 'running' && vm.status !== 'stopped') {
      throw new BadRequestException(`Cannot ${action} VM in ${vm.status} state`);
    }
    if (action === 'start' && vm.status === 'running') {
      throw new BadRequestException('VM is already running');
    }
    if ((action === 'stop' || action === 'shutdown') && vm.status === 'stopped') {
      throw new BadRequestException('VM is already stopped');
    }
    if (action === 'restart' && vm.status !== 'running') {
      throw new BadRequestException('Can only restart a running VM');
    }

    const jobType = action === 'shutdown' ? 'shutdown-vm' : `${action}-vm`;

    await this.jobService.enqueueJob(jobType as any, {
      vmId: vm.id,
      proxmoxId: vm.proxmoxId,
    }, {
      userId,
      auditLog: { action: `vm.${action}`, resource: 'vm', resourceId: vm.id },
    });

    return { message: `${action} command queued` };
  }

  async deleteVm(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);

    if (vm.status === 'provisioning') {
      throw new BadRequestException('Cannot delete VM while it is provisioning');
    }

    await this.jobService.enqueueJob('delete-vm', {
      vmId: vm.id,
      proxmoxId: vm.proxmoxId,
    }, {
      userId,
      auditLog: { action: 'vm.delete', resource: 'vm', resourceId: vm.id },
    });

    return { message: 'Delete command queued' };
  }

  async resizeVm(userId: string, vmId: string, dto: { cpuCores?: number; memoryMb?: number; diskGb?: number }) {
    const vm = await this.getVm(vmId, userId);

    const pool = await this.prisma.resourcePool.findFirst({
      where: { userId },
      include: { allocations: true },
    });
    if (!pool) throw new BadRequestException('No resource pool found');

    const currentAlloc = pool.allocations.find((a) => a.vmId === vmId);
    if (!currentAlloc) throw new BadRequestException('No resource allocation found for VM');

    const cpuDelta = (dto.cpuCores ?? vm.cpuCores) - currentAlloc.cores;
    const memDelta = (dto.memoryMb ?? vm.memoryMb) - currentAlloc.memoryMb;
    const diskDelta = (dto.diskGb ?? vm.diskGb) - currentAlloc.diskGb;

    if (cpuDelta > 0 || memDelta > 0 || diskDelta > 0) {
      const available = await this.poolService.getPoolAvailable(pool.id);
      if (cpuDelta > 0 && cpuDelta > available.cores) {
        throw new ForbiddenException(`Insufficient CPU cores: need ${cpuDelta}, available ${available.cores}`);
      }
      if (memDelta > 0 && memDelta > available.memoryMb) {
        throw new ForbiddenException(`Insufficient memory: need ${memDelta}MB, available ${available.memoryMb}MB`);
      }
      if (diskDelta > 0 && diskDelta > available.diskGb) {
        throw new ForbiddenException(`Insufficient disk: need ${diskDelta}GB, available ${available.diskGb}GB`);
      }
    }

    const updatedVm = await this.prisma.vm.update({
      where: { id: vmId },
      data: {
        ...(dto.cpuCores && { cpuCores: dto.cpuCores }),
        ...(dto.memoryMb && { memoryMb: dto.memoryMb }),
        ...(dto.diskGb && { diskGb: dto.diskGb }),
      },
    });

    await this.prisma.resourceAllocation.update({
      where: { vmId },
      data: {
        ...(dto.cpuCores && { cores: dto.cpuCores }),
        ...(dto.memoryMb && { memoryMb: dto.memoryMb }),
        ...(dto.diskGb && { diskGb: dto.diskGb }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'vm.resize',
        resource: 'vm',
        resourceId: vmId,
        metadata: { before: { cpuCores: vm.cpuCores, memoryMb: vm.memoryMb, diskGb: vm.diskGb }, after: dto },
      },
    });

    return updatedVm;
  }

  async reinstallVm(userId: string, vmId: string, templateId: string) {
    const vm = await this.getVm(vmId, userId);
    const template = await this.prisma.vmTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new BadRequestException('Template not found');

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'vm.reinstall',
        resource: 'vm',
        resourceId: vmId,
        metadata: { oldTemplateId: vm.templateId, newTemplateId: templateId },
      },
    });

    return { message: 'Reinstall queued' };
  }

  async getVncUrl(userId: string, vmId: string): Promise<{ url: string; expiresAt: Date }> {
    await this.getVm(vmId, userId);

    const expiresAt = new Date(Date.now() + 300000);
    const token = randomUUID();

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'vm.console',
        resource: 'vm',
        resourceId: vmId,
        metadata: { expiresAt: expiresAt.toISOString() },
      },
    });

    return {
      url: `/api/vms/${vmId}/console?token=${token}`,
      expiresAt,
    };
  }
}
