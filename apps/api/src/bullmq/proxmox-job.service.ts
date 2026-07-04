import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { IdempotencyKeyRepository } from './idempotency-key.repository';

export type ProxmoxJobType =
  | 'create-vm'
  | 'start-vm'
  | 'stop-vm'
  | 'shutdown-vm'
  | 'restart-vm'
  | 'delete-vm'
  | 'suspend-vm'
  | 'resume-vm'
  | 'create-snapshot'
  | 'delete-snapshot'
  | 'backup-vm'
  | 'restore-backup'
  | 'clone-vm'
  | 'resize-vm'
  | 'reinstall-vm'
  | 'mount-iso'
  | 'eject-iso'
  | 'migrate-vm'
  | 'rollback-snapshot'
  | 'update-vm-config'
  | 'add-firewall-rule'
  | 'delete-firewall-rule'
  | 'download-url';

export interface ProxmoxJobData {
  type: ProxmoxJobType;
  idempotencyKey: string;
  userId?: string;
  auditLog?: {
    action: string;
    resource: string;
    resourceId?: string;
  };
  payload: Record<string, unknown>;
}

@Injectable()
export class ProxmoxJobService {
  private readonly logger = new Logger(ProxmoxJobService.name);

  constructor(
    @InjectQueue('proxmox-jobs') private readonly queue: Queue<ProxmoxJobData>,
    private readonly idempotencyKeyRepository: IdempotencyKeyRepository,
  ) {}

  async enqueueJob(
    type: ProxmoxJobType,
    payload: Record<string, unknown>,
    options?: {
      userId?: string;
      auditLog?: ProxmoxJobData['auditLog'];
      idempotencyKey?: string;
      delay?: number;
    },
  ) {
    const idempotencyKey = options?.idempotencyKey ?? `${type}-${randomUUID()}`;

    const existing = await this.idempotencyKeyRepository.findByKey(idempotencyKey);
    if (existing) {
      this.logger.warn(`Idempotency key "${idempotencyKey}" already exists (status=${existing.status}), skipping enqueue`);
      return { idempotencyKey, status: existing.status, skipped: true };
    }

    await this.idempotencyKeyRepository.create({
      key: idempotencyKey,
      action: type,
      status: 'pending',
    });

    const job = await this.queue.add(type, {
      type,
      idempotencyKey,
      userId: options?.userId,
      auditLog: options?.auditLog,
      payload,
    }, {
      jobId: idempotencyKey,
      delay: options?.delay,
    });

    this.logger.log(`Enqueued ${type} job (idempotencyKey=${idempotencyKey}, jobId=${job.id})`);
    return { idempotencyKey, jobId: job.id, status: 'queued' };
  }

  async getJobStatus(idempotencyKey: string) {
    return this.idempotencyKeyRepository.findByKey(idempotencyKey);
  }

  async findIdempotencyKey(key: string) {
    return this.idempotencyKeyRepository.findByKey(key);
  }

  async completeIdempotencyKey(key: string) {
    return this.idempotencyKeyRepository.updateStatus(key, 'completed', new Date());
  }

  async failIdempotencyKey(key: string) {
    return this.idempotencyKeyRepository.updateStatus(key, 'failed');
  }
}
