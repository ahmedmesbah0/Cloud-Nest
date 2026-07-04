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

    const defaultNode = await this.prisma.node.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultNode) throw new BadRequestException('No active node available');

    const vmid = await this.proxmox.getNextVmid();

    const vm = await this.prisma.$transaction(async (tx: any) => {
      const vm = await tx.vm.create({
        data: {
          userId,
          name: dto.name,
          status: 'provisioning',
          proxmoxId: vmid,
          nodeId: defaultNode.id,
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

      // Auto-assign an IP from the default pool
      const availableIp = await tx.ipAddress.findFirst({
        where: { isAssigned: false, vmId: null },
        orderBy: { address: 'asc' },
      });
      if (availableIp) {
        await tx.ipAddress.update({
          where: { id: availableIp.id },
          data: { isAssigned: true, vmId: vm.id },
        });
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'vm.create',
          resource: 'vm',
          resourceId: vm.id,
          metadata: { name: dto.name, templateId: dto.templateId, cpuCores: dto.cpuCores, memoryMb: dto.memoryMb, diskGb: dto.diskGb, vmid, node: defaultNode.id },
        },
      });

      return vm;
    });

    await this.jobService.enqueueJob('create-vm', {
      vmId: vm.id,
      vmid,
      name: dto.name,
      cores: dto.cpuCores,
      memory: dto.memoryMb,
      disk: dto.diskGb,
      templateVmid: Number(template.proxmoxTemplateId),
      node: defaultNode.proxmoxNodeId,
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

    // Check pool limits inside a transaction (read-only, don't update DB yet)
    await this.prisma.$transaction(async (tx: any) => {
      const pools: Array<{ id: string; totalCores: number; totalMemoryMb: number; totalDiskGb: number }> = await tx.$queryRawUnsafe(
        `SELECT id, "totalCores", "totalMemoryMb", "totalDiskGb" FROM "ResourcePool" WHERE "userId" = $1 FOR UPDATE`,
        userId,
      );
      const pool = pools[0];
      if (!pool) throw new BadRequestException('No resource pool found');

      const allocations: Array<{ cores: number; memoryMb: number; diskGb: number }> = await tx.$queryRawUnsafe(
        `SELECT COALESCE(SUM(cores), 0) as cores, COALESCE(SUM("memoryMb"), 0) as "memoryMb", COALESCE(SUM("diskGb"), 0) as "diskGb" FROM "ResourceAllocation" WHERE "poolId" = $1 AND "vmId" != $2`,
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
      const availCores = pool.totalCores - Number(used.cores);
      const availMem = pool.totalMemoryMb - Number(used.memoryMb);
      const availDisk = pool.totalDiskGb - Number(used.diskGb);

      if (cpuDelta > 0 && cpuDelta > availCores) {
        throw new ForbiddenException(`Insufficient CPU cores: need ${cpuDelta}, available ${availCores}`);
      }
      if (memDelta > 0 && memDelta > availMem) {
        throw new ForbiddenException(`Insufficient memory: need ${memDelta}MB, available ${availMem}MB`);
      }
      if (diskDelta > 0 && diskDelta > availDisk) {
        throw new ForbiddenException(`Insufficient disk: need ${diskDelta}GB, available ${availDisk}GB`);
      }
    });

    await this.jobService.enqueueJob('resize-vm', {
      vmId,
      proxmoxId: vm.proxmoxId,
      cores: dto.cpuCores ?? vm.cpuCores,
      memory: dto.memoryMb ?? vm.memoryMb,
      disk: dto.diskGb ?? vm.diskGb,
      node: vm.nodeId,
    }, {
      userId,
      auditLog: { action: 'vm.resize.proxmox', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Resize queued', vmId };
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

  async listBackups(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    return this.prisma.backup.findMany({
      where: { vmId: vm.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBackup(
    userId: string,
    vmId: string,
    dto: { mode?: 'snapshot' | 'suspend' | 'stop'; storage?: string; compress?: 'lzo' | 'gzip' | 'zstd' },
  ) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');

    const backup = await this.prisma.backup.create({
      data: {
        vmId: vm.id,
        name: `backup-${vm.name || vm.id}-${Date.now()}`,
        status: 'pending',
        storage: dto.storage ?? 'local-lvm',
        nodeId: vm.nodeId,
      },
    });

    await this.jobService.enqueueJob('backup-vm', {
      vmId: vm.id,
      vmid: vm.proxmoxId,
      backupId: backup.id,
      storage: dto.storage,
      mode: dto.mode,
      compress: dto.compress,
      node: vm.nodeId,
    }, {
      userId,
      auditLog: { action: 'vm.backup.create', resource: 'vm', resourceId: vm.id },
    });

    return backup;
  }

  async deleteBackup(userId: string, vmId: string, backupId: string) {
    const vm = await this.getVm(vmId, userId);
    const backup = await this.prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup || backup.vmId !== vm.id) throw new NotFoundException('Backup not found');

    await this.prisma.backup.update({
      where: { id: backupId },
      data: { status: 'failed' },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'vm.backup.delete',
        resource: 'backup',
        resourceId: backupId,
        metadata: { vmId },
      },
    });

    return { message: 'Backup deleted' };
  }

  async listSnapshots(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    return this.prisma.snapshot.findMany({
      where: { vmId: vm.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSnapshot(userId: string, vmId: string, name: string) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');

    const snapshot = await this.prisma.snapshot.create({
      data: {
        vmId: vm.id,
        name,
        status: 'pending',
        nodeId: vm.nodeId,
      },
    });

    await this.jobService.enqueueJob('create-snapshot', {
      vmId: vm.id,
      vmid: vm.proxmoxId,
      snapshotId: snapshot.id,
      name,
      node: vm.nodeId,
    }, {
      userId,
      auditLog: { action: 'vm.snapshot.create', resource: 'vm', resourceId: vm.id },
    });

    return snapshot;
  }

  async deleteSnapshot(userId: string, vmId: string, snapshotId: string) {
    const vm = await this.getVm(vmId, userId);
    const snapshot = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot || snapshot.vmId !== vm.id) throw new NotFoundException('Snapshot not found');

    if (snapshot.status !== 'created') {
      throw new BadRequestException('Snapshot must be in "created" state to delete');
    }

    const vmWithProxmox = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vmWithProxmox?.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');

    await this.jobService.enqueueJob('delete-snapshot', {
      vmId: vm.id,
      vmid: vmWithProxmox.proxmoxId,
      snapshotId: snapshot.id,
      name: snapshot.name,
      node: vm.nodeId,
    }, {
      userId,
      auditLog: { action: 'vm.snapshot.delete', resource: 'vm', resourceId: vm.id },
    });

    return { message: 'Snapshot deletion queued' };
  }

  async getMetrics(
    userId: string,
    vmId: string,
    timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' = 'hour',
  ) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');
    return this.proxmox.getVmRrdData(vm.proxmoxId, timeframe, vm.nodeId ?? undefined);
  }

  async getFirewallRules(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    return this.proxmox.getFirewallRules(vm.nodeId, vm.proxmoxId);
  }

  async addFirewallRule(userId: string, vmId: string, rule: Record<string, unknown>) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    await this.prisma.auditLog.create({
      data: {
        userId, action: 'vm.firewall.add',
        resource: 'vm', resourceId: vmId,
        metadata: { rule } as any,
      },
    });
    return this.proxmox.addFirewallRule(vm.nodeId, vm.proxmoxId, rule);
  }

  async deleteFirewallRule(userId: string, vmId: string, pos: number) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    await this.prisma.auditLog.create({
      data: {
        userId, action: 'vm.firewall.delete',
        resource: 'vm', resourceId: vmId,
        metadata: { pos } as any,
      },
    });
    return this.proxmox.deleteFirewallRule(vm.nodeId, vm.proxmoxId, pos);
  }

  async migrateVm(userId: string, vmId: string, targetNodeId: string, online?: boolean) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');

    const targetNode = await this.prisma.node.findUnique({ where: { id: targetNodeId } });
    if (!targetNode) throw new NotFoundException('Target node not found');

    await this.jobService.enqueueJob('migrate-vm', {
      vmId: vm.id,
      vmid: vm.proxmoxId,
      targetNode: targetNode.proxmoxNodeId,
      online: online ?? false,
      node: vm.nodeId,
    }, {
      userId,
      auditLog: { action: 'vm.migrate', resource: 'vm', resourceId: vm.id },
    });

    return { message: 'Migration queued' };
  }

  async getHardwareConfig(userId: string, vmId: string): Promise<Record<string, unknown>> {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    const node = await this.prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new NotFoundException('Node not found');
    const config = await this.proxmox.getVmConfig(node.proxmoxNodeId, vm.proxmoxId);
    const hardwareKeys = ['bios', 'boot', 'machine', 'cpu', 'sockets', 'numa', 'ostype', 'agent', 'vga', 'tablet', 'hotplug', 'acpi', 'kvm', 'efidisk0', 'tpmstate0', 'args', 'cores', 'memory'];
    const result: Record<string, unknown> = {};
    for (const key of hardwareKeys) {
      if (config[key] !== undefined) result[key] = config[key];
    }
    return result;
  }

  async updateHardwareConfig(userId: string, vmId: string, dto: Record<string, any>): Promise<{ message: string }> {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    if (vm.status !== 'stopped') throw new BadRequestException('VM must be stopped to change hardware config');

    const node = await this.prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const allowedKeys = ['bios', 'boot', 'machine', 'cpu', 'sockets', 'numa', 'ostype', 'agent', 'vga', 'tablet', 'hotplug', 'acpi', 'kvm', 'efidisk0', 'tpmstate0', 'args'];
    const config: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (dto[key] !== undefined) config[key] = dto[key];
    }

    if (Object.keys(config).length === 0) {
      throw new BadRequestException('No valid hardware settings provided');
    }

    await this.proxmox.updateVmConfig(vm.proxmoxId, config, node.proxmoxNodeId);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'vm.hardware.update',
        resource: 'vm',
        resourceId: vmId,
        metadata: { config } as any,
      },
    });

    return { message: 'Hardware configuration updated. Reboot the VM for changes to take effect.' };
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
