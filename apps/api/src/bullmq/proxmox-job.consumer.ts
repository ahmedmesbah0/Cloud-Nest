import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ProxmoxService, CLOUDNEST_MANAGED_TAG } from '../proxmox/proxmox.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { VmService } from '../vms/vm.service';
import { VmGateway } from '../vms/vm.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ProxmoxJobService, ProxmoxJobData, ProxmoxJobType } from './proxmox-job.service';

type VmStatus = 'running' | 'stopped' | 'suspended' | 'provisioning' | 'error' | 'deleted';

const JOB_STATUS_MAP: Partial<Record<ProxmoxJobType, VmStatus>> = {
  'create-vm': 'running',
  'start-vm': 'running',
  'stop-vm': 'stopped',
  'shutdown-vm': 'stopped',
  'restart-vm': 'running',
  'suspend-vm': 'suspended',
  'resume-vm': 'running',
  'delete-vm': 'deleted',
  'reinstall-vm': 'stopped',
  'resize-vm': 'running',
  'rollback-snapshot': 'stopped',
  'restore-backup': 'stopped',
  'update-vm-config': 'stopped',
};

@Processor('proxmox-jobs', {
  concurrency: 3,
})
export class ProxmoxJobConsumer extends WorkerHost {
  private readonly logger = new Logger(ProxmoxJobConsumer.name);

  constructor(
    private readonly proxmox: ProxmoxService,
    private readonly poolService: ResourcePoolService,
    private readonly vmService: VmService,
    private readonly vmGateway: VmGateway,
    private readonly jobService: ProxmoxJobService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<ProxmoxJobData>): Promise<unknown> {
    const { idempotencyKey, type, payload, auditLog, userId } = job.data;

    this.logger.log(`Processing ${type} job (idempotencyKey=${idempotencyKey})`);

    const ik = await this.jobService.findIdempotencyKey(idempotencyKey);
    if (!ik) {
      throw new Error(`Idempotency key "${idempotencyKey}" not found in database`);
    }
    if (ik.status === 'completed') {
      this.logger.warn(`Job ${idempotencyKey} already completed, skipping`);
      return { skipped: true, status: 'completed' };
    }

    try {
      const vmId = payload.vmId as string | undefined;
      const result = await this.executeJob(type, payload, userId);

      await this.jobService.completeIdempotencyKey(idempotencyKey);

      const newStatus = JOB_STATUS_MAP[type];
      if (vmId && newStatus) {
        const updateData: Record<string, unknown> = { status: newStatus };

        // Release pool resources after VM deletion
        if (type === 'delete-vm') {
          await this.poolService.releaseResources(vmId);
        }

        // Update VM + allocation after successful resize (with pool re-check)
        if (type === 'resize-vm') {
          const newCores = payload.cores as number;
          const newMem = payload.memory as number;
          const newDisk = payload.disk as number;
          updateData.cpuCores = newCores;
          updateData.memoryMb = newMem;
          updateData.diskGb = newDisk;

          const vmRecord = await this.vmService.getVmWithIps(vmId);
          if (vmRecord) {
            await this.poolService.resizeAllocation(vmId, newCores, newMem, newDisk, vmRecord.userId);
          }
        }

        if (type === 'create-vm') {
          if (payload.vmid) updateData.proxmoxId = payload.vmid;
          if (payload.node) updateData.nodeId = payload.node as string;
        }
        await this.vmService.updateVmStatus(vmId, newStatus, updateData);

        this.vmGateway.emitVmStatusUpdate(vmId, newStatus, {
          jobType: type,
          ...(payload.vmid ? { proxmoxId: payload.vmid as number } : {}),
        });

        if (userId) {
          this.vmGateway.emitUserNotification(userId, 'vm-notification', {
            vmId,
            message: `VM ${newStatus}`,
            type,
          });
          await this.notificationsService.create(userId, `VM ${newStatus}`, `Your VM (${payload.name ?? ''}) is now ${newStatus}.`);
        }
      }

      // Update backup record on success
      if (type === 'backup-vm' && payload.backupId) {
        const backupRecord = await this.vmService.findBackupWithVm(payload.backupId as string);
        let volid: string | null = null;
        if (backupRecord?.vm?.node?.proxmoxNodeId && backupRecord.storage) {
          try {
            const content = await this.proxmox.getStorageContent(backupRecord.storage, backupRecord.vm.node.proxmoxNodeId);
            const backupFiles = (content as any[]).filter(
              (c: any) => c.content === 'backup' && String(c.vmid) === String(payload.vmid),
            );
            if (backupFiles.length > 0) {
              volid = backupFiles[0].volid;
            }
          } catch { /* non-critical */ }
        }
        await this.vmService.completeBackup(payload.backupId as string, {
          status: 'completed', completedAt: new Date(), proxmoxId: String(result), volid,
        });
        if (userId) {
          this.vmGateway.emitUserNotification(userId, 'vm-notification', {
            vmId,
            message: 'Backup completed',
            type: 'backup-vm',
          });
          await this.notificationsService.create(userId, 'Backup completed', `VM backup completed successfully.`);
        }
      }

      // Update snapshot record on success
      if (type === 'create-snapshot' && payload.snapshotId) {
        await this.vmService.completeSnapshot(payload.snapshotId as string, {
          status: 'created', proxmoxId: String(result),
        });
        if (userId) {
          this.vmGateway.emitUserNotification(userId, 'vm-notification', {
            vmId,
            message: 'Snapshot created',
            type: 'create-snapshot',
          });
          await this.notificationsService.create(userId, 'Snapshot created', `VM snapshot created successfully.`);
        }
      }

      // Remove snapshot record after successful delete
      if (type === 'delete-snapshot' && payload.snapshotId) {
        try {
          await this.vmService.removeSnapshotRecord(payload.snapshotId as string);
        } catch {
          this.logger.warn(`Snapshot ${payload.snapshotId} already removed from database`);
        }
        if (userId) {
          this.vmGateway.emitUserNotification(userId, 'vm-notification', {
            vmId,
            message: 'Snapshot deleted',
            type: 'delete-snapshot',
          });
          await this.notificationsService.create(userId, 'Snapshot deleted', `VM snapshot was deleted.`);
        }
      }

      if (auditLog && userId) {
        await this.vmService.logAuditAction({
          userId,
          action: auditLog.action,
          resource: auditLog.resource,
          resourceId: auditLog.resourceId,
          metadata: { idempotencyKey, payload },
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Job ${idempotencyKey} failed: ${(error as Error).message}`);

      const vmId = payload.vmId as string | undefined;
      if (vmId) {
        try {
          await this.vmService.updateVmStatus(vmId, 'error');
        } catch {
          this.logger.warn(`Failed to set error status on VM ${vmId} — record may not exist`);
        }
        this.vmGateway.emitVmStatusUpdate(vmId, 'error', { error: (error as Error).message });
      }

      if (job.attemptsMade >= (job.opts?.attempts ?? 5) - 1) {
        await this.jobService.failIdempotencyKey(idempotencyKey);
      }

      throw error;
    }
  }

  private async executeJob(type: ProxmoxJobType, payload: Record<string, unknown>, userId?: string) {
    const node = (payload.node as string) ?? undefined;

    switch (type) {
      case 'create-vm': {
        const vmid = payload.vmid as number;
        const templateVmid = payload.templateVmid as number;
        // Clone from template (full clone), then start the VM
        await this.proxmox.cloneVm(templateVmid, vmid, { full: 1, name: payload.name as string }, node);
        await this.proxmox.startVm(vmid, node);
        // Tag the VM so we only ever manage our own VMs
        await this.proxmox.setVmTags(vmid, [CLOUDNEST_MANAGED_TAG], node);
        // Set Notes field with VM metadata for identification in Proxmox UI
        await this.setVmNotes(vmid, payload, userId, node);
        return { vmid, status: 'running' };
      }

      case 'start-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.startVm(payload.vmid as number, node);

      case 'stop-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.stopVm(payload.vmid as number, node);

      case 'shutdown-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.shutdownVm(payload.vmid as number, node);

      case 'restart-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.restartVm(payload.vmid as number, node);

      case 'delete-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.deleteVm(payload.vmid as number, node);

      case 'suspend-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.suspendVm(payload.vmid as number, node);

      case 'resume-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.resumeVm(payload.vmid as number, node);

      case 'create-snapshot':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.createSnapshot(
          payload.vmid as number,
          payload.name as string,
          node,
        );

      case 'delete-snapshot':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.deleteSnapshot(
          payload.vmid as number,
          payload.name as string,
          node,
        );

      case 'clone-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.cloneVm(
          payload.vmid as number,
          payload.newId as number,
          {
            name: payload.name as string | undefined,
            full: payload.full as number | undefined,
          },
          node,
        );

      case 'backup-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.backupVm(
          payload.vmid as number,
          {
            storage: payload.storage as string | undefined,
            mode: payload.mode as 'snapshot' | 'suspend' | 'stop' | undefined,
            compress: payload.compress as 'lzo' | 'gzip' | 'zstd' | undefined,
          },
          node,
        );

      case 'restore-backup': {
        const vmid = payload.vmid as number;
        await this.proxmox.assertVmManaged(vmid, node);
        await this.proxmox.stopVm(vmid, node);
        const archive = payload.archive as string;
        if (!archive) throw new Error('archive is required for restore-backup');
        return this.proxmox.restoreVmBackup(vmid, archive, { force: true }, node);
      }

      case 'resize-vm': {
        const vmid = payload.vmid as number;
        await this.proxmox.assertVmManaged(vmid, node);
        const cores = payload.cores as number;
        const memory = payload.memory as number;
        const disk = payload.disk as number;
        // Update CPU and memory
        await this.proxmox.updateVmConfig(vmid, { cores, memory }, node);
        // Resize disk if needed (default disk name 'virtio0')
        if (disk) {
          try {
            await this.proxmox.resizeDisk(vmid, 'virtio0', disk, node);
          } catch {
            this.logger.warn(`Disk resize for VM ${vmid} to ${disk}G failed — disk may not be resizable via API`);
          }
        }
        return { cores, memory, disk, status: 'resized' };
      }

      case 'reinstall-vm':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.cloneVm(
          payload.templateVmid as number,
          payload.vmid as number,
          { full: 1 },
          node,
        );

      case 'mount-iso':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.mountIso(
          payload.vmid as number,
          payload.iso as string,
          { storage: payload.storage as string | undefined },
          node,
        );

      case 'eject-iso':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.ejectIso(
          payload.vmid as number,
          node,
        );

      case 'migrate-vm': {
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.migrateVm(
          payload.vmid as number,
          payload.targetNode as string,
          { online: payload.online as boolean },
          node,
        );
      }

      case 'rollback-snapshot': {
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        await this.proxmox.stopVm(payload.vmid as number, node);
        const result = await this.proxmox.rollbackSnapshot(
          payload.vmid as number,
          payload.name as string,
          node,
        );
        return result;
      }

      case 'update-vm-config':
        await this.proxmox.assertVmManaged(payload.vmid as number, node);
        return this.proxmox.updateVmConfig(
          payload.vmid as number,
          payload.config as Record<string, unknown>,
          node,
        );

      case 'add-firewall-rule': {
        const fwNode = payload.fwNode as string ?? node;
        return this.proxmox.addFirewallRule(
          fwNode,
          payload.vmid as number,
          payload.rule as Record<string, unknown>,
        );
      }

      case 'delete-firewall-rule': {
        const fwNode = payload.fwNode as string ?? node;
        return this.proxmox.deleteFirewallRule(
          fwNode,
          payload.vmid as number,
          payload.pos as number,
        );
      }

      case 'download-url': {
        const dlNode = payload.dlNode as string ?? node;
        return this.proxmox.downloadUrl(
          payload.url as string,
          payload.storage as string,
          dlNode,
        );
      }

      default:
        throw new Error(`Unknown proxmox job type: ${type}`);
    }
  }

  private async setVmNotes(vmid: number, payload: Record<string, unknown>, userId: string | undefined, node: string | undefined) {
    try {
      const vmId = payload.vmId as string;
      if (!vmId) return;

      const vmRecord = await this.vmService.getVmWithIps(vmId);
      if (!vmRecord) return;

      const ownerId = userId ?? vmRecord.userId;
      const hostname = (payload.name as string) ?? vmRecord.name;
      const ip = vmRecord.ipAddresses.length > 0 ? vmRecord.ipAddresses[0].address : 'Pending';
      const created = vmRecord.createdAt.toISOString().replace('T', ' ').substring(0, 19);

      const description = `CloudNest Managed VM | IP: ${ip} | Hostname: ${hostname} | User: ${ownerId} | Created: ${created}`;
      await this.proxmox.updateVmConfig(vmid, { description }, node);
    } catch (error) {
      this.logger.warn(`Failed to set VM notes for ${vmid}: ${(error as Error).message}`);
    }
  }
}
