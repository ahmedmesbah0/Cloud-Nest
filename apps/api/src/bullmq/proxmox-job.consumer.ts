import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { VmGateway } from '../vms/vm.gateway';
import { ProxmoxJobData, ProxmoxJobType } from './proxmox-job.service';

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
};

@Processor('proxmox-jobs', {
  concurrency: 3,
})
export class ProxmoxJobConsumer extends WorkerHost {
  private readonly logger = new Logger(ProxmoxJobConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proxmox: ProxmoxService,
    private readonly vmGateway: VmGateway,
  ) {
    super();
  }

  async process(job: Job<ProxmoxJobData>): Promise<unknown> {
    const { idempotencyKey, type, payload, auditLog, userId } = job.data;

    this.logger.log(`Processing ${type} job (idempotencyKey=${idempotencyKey})`);

    const ik = await this.prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });
    if (!ik) {
      throw new Error(`Idempotency key "${idempotencyKey}" not found in database`);
    }
    if (ik.status === 'completed') {
      this.logger.warn(`Job ${idempotencyKey} already completed, skipping`);
      return { skipped: true, status: 'completed' };
    }

    try {
      const vmId = payload.vmId as string | undefined;
      const result = await this.executeJob(type, payload);

      await this.prisma.idempotencyKey.update({
        where: { key: idempotencyKey },
        data: { status: 'completed', completedAt: new Date() },
      });

      const newStatus = JOB_STATUS_MAP[type];
      if (vmId && newStatus) {
        const updateData: Record<string, unknown> = { status: newStatus };
        if (type === 'create-vm' && payload.vmid) {
          updateData.proxmoxId = payload.vmid;
          if (payload.node) updateData.nodeId = payload.node;
        }
        await this.prisma.vm.update({
          where: { id: vmId },
          data: updateData,
        });

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
        }
      }

      if (auditLog && userId) {
        await this.prisma.auditLog.create({
          data: {
            userId,
            action: auditLog.action,
            resource: auditLog.resource,
            resourceId: auditLog.resourceId,
            metadata: { idempotencyKey, payload } as any,
          },
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Job ${idempotencyKey} failed: ${(error as Error).message}`);

      const vmId = payload.vmId as string | undefined;
      if (vmId) {
        await this.prisma.vm.update({
          where: { id: vmId },
          data: { status: 'error' },
        }).catch(() => {});
        this.vmGateway.emitVmStatusUpdate(vmId, 'error', { error: (error as Error).message });
      }

      if (job.attemptsMade >= (job.opts?.attempts ?? 5) - 1) {
        await this.prisma.idempotencyKey.update({
          where: { key: idempotencyKey },
          data: { status: 'failed' },
        });
      }

      throw error;
    }
  }

  private async executeJob(type: ProxmoxJobType, payload: Record<string, unknown>) {
    const node = (payload.node as string) ?? undefined;

    switch (type) {
      case 'create-vm':
        return this.proxmox.createVm(
          {
            vmid: payload.vmid as number,
            name: payload.name as string,
            cores: payload.cores as number,
            memory: payload.memory as number,
            disk: payload.disk as number,
            storage: payload.storage as string,
            cloudInitConfig: payload.cloudInitConfig as Record<string, string> | undefined,
          },
          node,
        );

      case 'start-vm':
        return this.proxmox.startVm(payload.vmid as number, node);

      case 'stop-vm':
        return this.proxmox.stopVm(payload.vmid as number, node);

      case 'shutdown-vm':
        return this.proxmox.shutdownVm(payload.vmid as number, node);

      case 'restart-vm':
        return this.proxmox.restartVm(payload.vmid as number, node);

      case 'delete-vm':
        return this.proxmox.deleteVm(payload.vmid as number, node);

      case 'suspend-vm':
        return this.proxmox.suspendVm(payload.vmid as number, node);

      case 'resume-vm':
        return this.proxmox.resumeVm(payload.vmid as number, node);

      case 'create-snapshot':
        return this.proxmox.createSnapshot(
          payload.vmid as number,
          payload.name as string,
          node,
        );

      case 'delete-snapshot':
        return this.proxmox.deleteSnapshot(
          payload.vmid as number,
          payload.name as string,
          node,
        );

      case 'clone-vm':
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
        return this.proxmox.backupVm(
          payload.vmid as number,
          {
            storage: payload.storage as string | undefined,
            mode: payload.mode as 'snapshot' | 'suspend' | 'stop' | undefined,
            compress: payload.compress as 'lzo' | 'gzip' | 'zstd' | undefined,
          },
          node,
        );

      case 'resize-vm':
        return this.proxmox.updateVmConfig(
          payload.vmid as number,
          {
            cores: payload.cores as number,
            memory: payload.memory as number,
          },
          node,
        );

      case 'reinstall-vm':
        return this.proxmox.cloneVm(
          payload.templateVmid as number,
          payload.vmid as number,
          { full: 1 },
          node,
        );

      case 'mount-iso':
        return this.proxmox.mountIso(
          payload.vmid as number,
          payload.iso as string,
          { storage: payload.storage as string | undefined },
          node,
        );

      case 'eject-iso':
        return this.proxmox.ejectIso(
          payload.vmid as number,
          node,
        );

      default:
        throw new Error(`Unknown proxmox job type: ${type}`);
    }
  }
}
