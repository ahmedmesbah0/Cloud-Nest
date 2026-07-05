import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VmRepository } from './vm.repository';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class VmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vmRepo: VmRepository,
    private readonly jobService: ProxmoxJobService,
    private readonly poolService: ResourcePoolService,
    private readonly proxmox: ProxmoxService,
    private readonly subsService: SubscriptionsService,
  ) {}

  async listTemplates() {
    return this.vmRepo.findActiveTemplates();
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
    const user = await this.vmRepo.findUserById(userId);
    if (!user) throw new BadRequestException('User not found');
    if (!user.isActive) throw new ForbiddenException('Account is suspended');

    const activeSubCount = await this.subsService.countActiveByUser(userId);
    if (activeSubCount === 0) {
      throw new ForbiddenException('An active subscription is required to create servers');
    }

    const pool = await this.vmRepo.findPoolById(dto.poolId);
    if (!pool) throw new BadRequestException('Resource pool not found');
    if (pool.userId !== userId) throw new ForbiddenException('Not your pool');

    const template = await this.vmRepo.findTemplateById(dto.templateId);
    if (!template) throw new BadRequestException('Template not found');

    const defaultNode = await this.vmRepo.findFirstActiveNode();
    if (!defaultNode) throw new BadRequestException('No active node available');

    const vmid = await this.proxmox.getNextVmid();

    const vm = await this.prisma.$transaction(async (tx: any) => {
      const vm = await this.vmRepo.createVm({
        userId,
        name: dto.name,
        status: 'provisioning',
        proxmoxId: vmid,
        nodeId: defaultNode.id,
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskGb: dto.diskGb,
        templateId: dto.templateId,
      }, tx);

      await this.poolService.allocateResources({
        poolId: dto.poolId,
        vmId: vm.id,
        cores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskGb: dto.diskGb,
      }, tx);

      // Auto-assign an IP from the default pool
      const availableIp = await this.vmRepo.findAvailableIp(tx);
      if (availableIp) {
        await this.vmRepo.assignIpToVm(availableIp.id, vm.id, tx);
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
    return this.vmRepo.findVmsByUser(userId);
  }

  async getVm(vmId: string, userId: string) {
    const vm = await this.vmRepo.findVmById(vmId);
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
      const pools = await this.vmRepo.lockUserPools(userId, tx);
      const pool = pools[0];
      if (!pool) throw new BadRequestException('No resource pool found');

      const allocations = await this.vmRepo.sumAllocationsExcludingVm(pool.id, vmId, tx);

      const currentAllocs = await this.vmRepo.findAllocationByVm(vmId, tx);
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
    const template = await this.vmRepo.findTemplateById(templateId);
    if (!template) throw new BadRequestException('Template not found');

    await this.prisma.$transaction(async (tx: any) => {
      await this.vmRepo.updateVm(vmId, { status: 'provisioning' }, tx);
      await tx.auditLog.create({
        data: { userId, action: 'vm.reinstall.status', resource: 'vm', resourceId: vmId },
      });
    });

    const result = await this.jobService.enqueueJob('reinstall-vm', {
      vmId,
      proxmoxId: vm.proxmoxId,
      templateVmid: Number(template.proxmoxTemplateId),
    }, {
      userId,
      auditLog: { action: 'vm.reinstall', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Reinstall queued', ...result };
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

  // --- ISO Management ---

  async getIsoStorages(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.nodeId) throw new BadRequestException('VM has no node');
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');
    const storages = await this.proxmox.getStoragePools(node.proxmoxNodeId);
    return (storages as any[]).filter((s: any) =>
      s.content?.includes('iso'),
    );
  }

  async getIsoList(userId: string, vmId: string, storage: string) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.nodeId) throw new BadRequestException('VM has no node');
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');
    const content = await this.proxmox.getStorageContent(storage, node.proxmoxNodeId);
    return (content as any[]).filter((c: any) =>
      c.content === 'iso',
    );
  }

  async getCurrentIso(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');
    return this.proxmox.getCurrentIso(vm.proxmoxId);
  }

  async downloadUrlIso(userId: string, vmId: string, url: string, storage: string) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.nodeId) throw new BadRequestException('VM has no node');
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');
    if (!url) throw new BadRequestException('URL is required');
    if (!storage) throw new BadRequestException('Storage is required');

    const result = await this.jobService.enqueueJob('download-url', {
      vmId,
      url,
      storage,
      dlNode: node.proxmoxNodeId,
    }, {
      userId,
      auditLog: { action: 'vm.iso.download-url', resource: 'vm', resourceId: vmId },
    });

    return { message: 'ISO download queued', task: result };
  }

  async listBackups(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    return this.vmRepo.findBackupsByVm(vm.id);
  }

  async createBackup(
    userId: string,
    vmId: string,
    dto: { mode?: 'snapshot' | 'suspend' | 'stop'; storage?: string; compress?: 'lzo' | 'gzip' | 'zstd' },
  ) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');

    const backup = await this.vmRepo.createBackup({
      vmId: vm.id,
      name: `backup-${vm.name || vm.id}-${Date.now()}`,
      status: 'pending',
      storage: dto.storage ?? 'local-lvm',
      nodeId: vm.nodeId,
    });

    // Retention/FIFO: if more than 5 backups exist, delete the oldest completed one
    const existing = await this.vmRepo.findCompletedBackupsByVm(vm.id);
    const MAX_BACKUPS = 5;
    if (existing.length >= MAX_BACKUPS) {
      const toDelete = existing[0];
      await this.prisma.$transaction(async (tx: any) => {
        await this.vmRepo.updateBackup(toDelete.id, { status: 'failed' }, tx);
        await tx.auditLog.create({
          data: { userId, action: 'vm.backup.retention-evict', resource: 'backup', resourceId: toDelete.id, metadata: { vmId, reason: 'FIFO eviction' } },
        });
      });
    }

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
    const backup = await this.vmRepo.findBackupById(backupId);
    if (!backup || backup.vmId !== vm.id) throw new NotFoundException('Backup not found');

    await this.prisma.$transaction(async (tx: any) => {
      await this.vmRepo.updateBackup(backupId, { status: 'failed' }, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'vm.backup.delete',
          resource: 'backup',
          resourceId: backupId,
          metadata: { vmId },
        },
      });
    });

    return { message: 'Backup deleted' };
  }

  async restoreBackup(userId: string, vmId: string, backupId: string) {
    const vm = await this.getVm(vmId, userId);
    const backup = await this.vmRepo.findBackupById(backupId);
    if (!backup || backup.vmId !== vm.id) throw new NotFoundException('Backup not found');
    if (backup.status !== 'completed') throw new BadRequestException('Backup must be completed to restore');
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');

    let archive = backup.volid;
    if (!archive) {
      const node = await this.vmRepo.findNodeById(vm.nodeId);
      if (!node) throw new NotFoundException('Node not found');
      const content = await this.proxmox.getStorageContent(backup.storage, node.proxmoxNodeId);
      const backupFiles = (content as any[]).filter(
        (c: any) => c.content === 'backup' && String(c.vmid) === String(vm.proxmoxId),
      );
      if (backupFiles.length === 0) throw new BadRequestException('Backup file not found in storage');
      archive = backupFiles.sort((a: any, b: any) => new Date(b.ctime).getTime() - new Date(a.ctime).getTime())[0].volid;
    }

    await this.jobService.enqueueJob('restore-backup', {
      vmId: vm.id,
      vmid: vm.proxmoxId,
      archive,
      node: vm.nodeId,
    }, {
      userId,
      auditLog: { action: 'vm.backup.restore', resource: 'vm', resourceId: vm.id },
    });

    return { message: 'Backup restore queued' };
  }

  async listSnapshots(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    return this.vmRepo.findSnapshotsByVm(vm.id);
  }

  async createSnapshot(userId: string, vmId: string, name: string, description?: string) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');

    const snapshot = await this.vmRepo.createSnapshot({
      vmId: vm.id,
      name,
      description: description ?? null,
      status: 'pending',
      nodeId: vm.nodeId,
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
    const snapshot = await this.vmRepo.findSnapshotById(snapshotId);
    if (!snapshot || snapshot.vmId !== vm.id) throw new NotFoundException('Snapshot not found');

    if (snapshot.status !== 'created') {
      throw new BadRequestException('Snapshot must be in "created" state to delete');
    }

    const vmWithProxmox = await this.vmRepo.findVmById(vmId);
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

  async rollbackSnapshot(userId: string, vmId: string, snapshotId: string) {
    const vm = await this.getVm(vmId, userId);
    const snapshot = await this.vmRepo.findSnapshotById(snapshotId);
    if (!snapshot || snapshot.vmId !== vm.id) throw new NotFoundException('Snapshot not found');

    if (snapshot.status !== 'created') {
      throw new BadRequestException('Snapshot must be in "created" state to rollback');
    }

    const vmWithProxmox = await this.vmRepo.findVmById(vmId);
    if (!vmWithProxmox?.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');

    await this.jobService.enqueueJob('rollback-snapshot', {
      vmId: vm.id,
      vmid: vmWithProxmox.proxmoxId,
      name: snapshot.name,
      node: vm.nodeId,
    }, {
      userId,
      auditLog: { action: 'vm.snapshot.rollback', resource: 'vm', resourceId: vm.id },
    });

    return { message: 'Snapshot rollback queued' };
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
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');

    await this.jobService.enqueueJob('add-firewall-rule', {
      vmId,
      vmid: vm.proxmoxId,
      fwNode: node.proxmoxNodeId,
      rule,
    }, {
      userId,
      auditLog: { action: 'vm.firewall.add', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Firewall rule queued' };
  }

  async deleteFirewallRule(userId: string, vmId: string, pos: number) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');

    await this.jobService.enqueueJob('delete-firewall-rule', {
      vmId,
      vmid: vm.proxmoxId,
      fwNode: node.proxmoxNodeId,
      pos,
    }, {
      userId,
      auditLog: { action: 'vm.firewall.delete', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Firewall rule delete queued' };
  }

  async migrateVm(userId: string, vmId: string, targetNodeId: string, online?: boolean) {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');

    const targetNode = await this.vmRepo.findNodeById(targetNodeId);
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
    const node = await this.vmRepo.findNodeById(vm.nodeId);
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

    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');

    const allowedKeys = ['bios', 'boot', 'machine', 'cpu', 'sockets', 'numa', 'ostype', 'agent', 'vga', 'tablet', 'hotplug', 'acpi', 'kvm', 'efidisk0', 'tpmstate0', 'args'];
    const config: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (dto[key] !== undefined) config[key] = dto[key];
    }

    if (Object.keys(config).length === 0) {
      throw new BadRequestException('No valid hardware settings provided');
    }

    await this.jobService.enqueueJob('update-vm-config', {
      vmId,
      vmid: vm.proxmoxId,
      config,
      node: node.proxmoxNodeId,
    }, {
      userId,
      auditLog: { action: 'vm.hardware.update', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Hardware configuration update queued. Reboot the VM for changes to take effect.' };
  }

  // --- Network Interfaces ---

  async getNetworkInterfaces(userId: string, vmId: string): Promise<Record<string, string>> {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');
    const config = await this.proxmox.getVmConfig(node.proxmoxNodeId, vm.proxmoxId);
    const result: Record<string, string> = {};
    for (const key of Object.keys(config)) {
      if (key.startsWith('net') && /^\d+$/.test(key.slice(3))) {
        result[key] = String(config[key]);
      }
    }
    return result;
  }

  async setNetworkInterface(userId: string, vmId: string, key: string, value: string) {
    if (!/^net\d+$/.test(key)) throw new BadRequestException('Invalid network key (must be netN)');
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    if (vm.status !== 'stopped') throw new BadRequestException('VM must be stopped to change network config');
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');
    await this.jobService.enqueueJob('update-vm-config', {
      vmId,
      vmid: vm.proxmoxId,
      config: { [key]: value },
      node: node.proxmoxNodeId,
    }, {
      userId,
      auditLog: { action: 'vm.network.set', resource: 'vm', resourceId: vmId },
    });
    return { message: `Network interface ${key} update queued.` };
  }

  async deleteNetworkInterface(userId: string, vmId: string, key: string) {
    if (!/^net\d+$/.test(key)) throw new BadRequestException('Invalid network key (must be netN)');
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID or node');
    if (vm.status !== 'stopped') throw new BadRequestException('VM must be stopped to change network config');
    const node = await this.vmRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');
    await this.jobService.enqueueJob('update-vm-config', {
      vmId,
      vmid: vm.proxmoxId,
      config: { [key]: 'delete' },
      node: node.proxmoxNodeId,
    }, {
      userId,
      auditLog: { action: 'vm.network.delete', resource: 'vm', resourceId: vmId },
    });
    return { message: `Network interface ${key} delete queued.` };
  }

  // --- DNS ---

  async getDnsConfig(userId: string, vmId: string) {
    const vm = await this.getVm(vmId, userId);
    return {
      nameserver1: vm.nameserver1 || null,
      nameserver2: vm.nameserver2 || null,
      searchdomain: vm.searchdomain || null,
    };
  }

  async setDnsConfig(userId: string, vmId: string, dto: { nameserver1?: string; nameserver2?: string; searchdomain?: string }) {
    const vm = await this.getVm(vmId, userId);
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const u = await this.vmRepo.updateVm(vmId, {
        nameserver1: dto.nameserver1 ?? vm.nameserver1,
        nameserver2: dto.nameserver2 ?? vm.nameserver2,
        searchdomain: dto.searchdomain ?? vm.searchdomain,
      }, tx);
      await tx.auditLog.create({
        data: { userId, action: 'vm.dns.update', resource: 'vm', resourceId: vmId, metadata: dto as any },
      });
      return u;
    });
    return {
      nameserver1: updated.nameserver1,
      nameserver2: updated.nameserver2,
      searchdomain: updated.searchdomain,
    };
  }

  // --- Internal methods (no ownership checks, for consumer use) ---

  async logAuditAction(data: {
    userId: string; action: string; resource: string; resourceId?: string; metadata?: any;
  }) {
    await this.vmRepo.createAuditLog(data);
  }

  async countTotal() {
    return this.vmRepo.countAll();
  }

  async countRunning() {
    return this.vmRepo.countByStatus('running');
  }

  async countNewSince(since: Date) {
    return this.vmRepo.countNewSince(since);
  }

  async updateVmStatus(vmId: string, status: string, additionalData?: Record<string, unknown>) {
    return this.vmRepo.updateVm(vmId, { status, ...additionalData });
  }

  async getVmWithIps(vmId: string) {
    return this.vmRepo.findVmWithIps(vmId);
  }

  async completeBackup(backupId: string, data: Record<string, unknown>) {
    return this.vmRepo.updateBackup(backupId, data);
  }

  async completeSnapshot(snapshotId: string, data: Record<string, unknown>) {
    return this.vmRepo.updateSnapshot(snapshotId, data);
  }

  async removeSnapshotRecord(snapshotId: string) {
    return this.vmRepo.deleteSnapshot(snapshotId);
  }

  async findBackupWithVm(backupId: string) {
    return this.vmRepo.findBackupWithVm(backupId);
  }

  async getVncUrl(userId: string, vmId: string): Promise<{ host: string; port: string; ticket: string; cert: string }> {
    const vm = await this.getVm(vmId, userId);
    if (!vm.proxmoxId) throw new BadRequestException('VM has no Proxmox ID');
    if (vm.status !== 'running') throw new BadRequestException('VM must be running for console access');

    const vncInfo = await this.proxmox.getVncTicket(vm.proxmoxId);

    await this.prisma.$transaction(async (tx: any) => {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'vm.console',
          resource: 'vm',
          resourceId: vmId,
          metadata: { timestamp: new Date().toISOString() },
        },
      });
    });

    return { ...vncInfo, host: process.env.PROXMOX_HOST || '172.16.1.10' };
  }

  async getActivities(userId: string, vmId: string, page = 1, limit = 50) {
    const vm = await this.vmRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (vm.userId !== userId) throw new NotFoundException('VM not found');
    const skip = (page - 1) * limit;
    const [activities, total] = await Promise.all([
      this.vmRepo.findAuditLogsByResource('vm', vmId, skip, limit),
      this.vmRepo.countAuditLogsByResource('vm', vmId),
    ]);
    return { activities, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
