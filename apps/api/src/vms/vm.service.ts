import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxService } from '../proxmox/proxmox.service';

@Injectable()
export class VmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: ProxmoxJobService,
    private readonly poolService: ResourcePoolService,
    private readonly proxmox: ProxmoxService,
  ) {}

  async listTemplates() {
    return this.prisma.vmTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

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

      await this.poolService.allocateResources({
        poolId: dto.poolId,
        vmId: vm.id,
        cores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskGb: dto.diskGb,
      }, tx);

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

    const updatedVm = await this.prisma.$transaction(async (tx: any) => {
      const pools: Array<{ id: string; totalCores: number; totalMemoryMb: number; totalDiskGb: number; totalIps: number }> = await tx.$queryRawUnsafe(
        `SELECT id, "totalCores", "totalMemoryMb", "totalDiskGb", "totalIps" FROM "ResourcePool" WHERE "userId" = $1 FOR UPDATE`,
        userId,
      );

      const pool = pools[0];
      if (!pool) throw new BadRequestException('No resource pool found');

      const allocations: Array<{ cores: number; memoryMb: number; diskGb: number; ips: number }> = await tx.$queryRawUnsafe(
        `SELECT COALESCE(SUM(cores), 0) as cores, COALESCE(SUM("memoryMb"), 0) as "memoryMb", COALESCE(SUM("diskGb"), 0) as "diskGb", COALESCE(SUM(ips), 0) as ips FROM "ResourceAllocation" WHERE "poolId" = $1 AND "vmId" != $2`,
        pool.id, vmId,
      );

      const currentAllocs: Array<{ cores: number; memoryMb: number; diskGb: number }> = await tx.$queryRawUnsafe(
        `SELECT cores, "memoryMb", "diskGb" FROM "ResourceAllocation" WHERE "vmId" = $1`,
        vmId,
      );
      const currentAlloc = currentAllocs[0];
      if (!currentAlloc) throw new BadRequestException('No resource allocation found for VM');

      const cpuDelta = (dto.cpuCores ?? vm.cpuCores) - Number(currentAlloc.cores);
      const memDelta = (dto.memoryMb ?? vm.memoryMb) - Number(currentAlloc.memoryMb);
      const diskDelta = (dto.diskGb ?? vm.diskGb) - Number(currentAlloc.diskGb);

      const used = allocations[0];
      const availableCores = pool.totalCores - Number(used.cores);
      const availableMemory = pool.totalMemoryMb - Number(used.memoryMb);
      const availableDisk = pool.totalDiskGb - Number(used.diskGb);

      if (cpuDelta > 0 && cpuDelta > availableCores) {
        throw new ForbiddenException(`Insufficient CPU cores: need ${cpuDelta}, available ${availableCores}`);
      }
      if (memDelta > 0 && memDelta > availableMemory) {
        throw new ForbiddenException(`Insufficient memory: need ${memDelta}MB, available ${availableMemory}MB`);
      }
      if (diskDelta > 0 && diskDelta > availableDisk) {
        throw new ForbiddenException(`Insufficient disk: need ${diskDelta}GB, available ${availableDisk}GB`);
      }

      const updatedVm = await tx.vm.update({
        where: { id: vmId },
        data: {
          ...(dto.cpuCores && { cpuCores: dto.cpuCores }),
          ...(dto.memoryMb && { memoryMb: dto.memoryMb }),
          ...(dto.diskGb && { diskGb: dto.diskGb }),
        },
      });

      await tx.resourceAllocation.update({
        where: { vmId },
        data: {
          ...(dto.cpuCores && { cores: dto.cpuCores }),
          ...(dto.memoryMb && { memoryMb: dto.memoryMb }),
          ...(dto.diskGb && { diskGb: dto.diskGb }),
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'vm.resize',
          resource: 'vm',
          resourceId: vmId,
          metadata: { before: { cpuCores: vm.cpuCores, memoryMb: vm.memoryMb, diskGb: vm.diskGb }, after: dto },
        },
      });

      return updatedVm;
    });

    await this.jobService.enqueueJob('resize-vm', {
      vmId,
      proxmoxId: vm.proxmoxId,
      cores: dto.cpuCores ?? vm.cpuCores,
      memory: dto.memoryMb ?? vm.memoryMb,
    }, {
      userId,
      auditLog: { action: 'vm.resize.proxmox', resource: 'vm', resourceId: vmId },
    });

    return updatedVm;
  }

  async reinstallVm(userId: string, vmId: string, templateId: string) {
    const vm = await this.getVm(vmId, userId);
    const template = await this.prisma.vmTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new BadRequestException('Template not found');

    await this.jobService.enqueueJob('reinstall-vm', {
      vmId,
      proxmoxId: vm.proxmoxId,
      templateVmid: Number(template.proxmoxTemplateId),
    }, {
      userId,
      auditLog: { action: 'vm.reinstall', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Reinstall queued' };
  }

  async mountIso(userId: string, vmId: string, iso: string, storage?: string) {
    const vm = await this.getVm(vmId, userId);
    if (vm.status !== 'stopped') {
      throw new BadRequestException('VM must be stopped to mount an ISO');
    }

    await this.jobService.enqueueJob('mount-iso', {
      vmId,
      proxmoxId: vm.proxmoxId,
      iso,
      storage,
    }, {
      userId,
      auditLog: { action: 'vm.mount-iso', resource: 'vm', resourceId: vmId },
    });

    return { message: 'ISO mount queued' };
  }

  async ejectIso(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    if (vm.status !== 'stopped') {
      throw new BadRequestException('VM must be stopped to eject an ISO');
    }

    await this.jobService.enqueueJob('eject-iso', {
      vmId,
      proxmoxId: vm.proxmoxId,
    }, {
      userId,
      auditLog: { action: 'vm.eject-iso', resource: 'vm', resourceId: vmId },
    });

    return { message: 'ISO eject queued' };
  }

  async getVncUrl(userId: string, vmId: string): Promise<{ host: string; port: string; ticket: string; cert: string }> {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');
    if (vm.status !== 'running') throw new BadRequestException('VM must be running for console access');

    const vncInfo = await this.proxmox.getVncTicket(vm.proxmoxId);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'vm.console',
        resource: 'vm',
        resourceId: vmId,
        metadata: { timestamp: new Date().toISOString() },
      },
    });

    return { ...vncInfo, host: process.env.PROXMOX_HOST || '172.16.1.10' };
  }
}
