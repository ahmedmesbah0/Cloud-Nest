import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SshKeysRepository } from './ssh-keys.repository';

@Injectable()
export class SshKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sshKeysRepo: SshKeysRepository,
  ) {}

  private computeFingerprint(publicKey: string): string {
    try {
      const parts = publicKey.trim().split(/\s+/);
      const b64 = parts[1] || parts[0];
      const raw = Buffer.from(b64, 'base64');
      const hash = createHash('sha256').update(raw).digest('base64');
      return `SHA256:${hash}`;
    } catch {
      return '';
    }
  }

  async list(userId: string, search?: string) {
    return this.sshKeysRepo.findMany(userId, search);
  }

  async listDeleted(userId: string) {
    return this.sshKeysRepo.findDeleted(userId);
  }

  async create(userId: string, name: string, publicKey: string) {
    const fingerprint = this.computeFingerprint(publicKey);
    return this.prisma.$transaction(async (tx: any) => {
      const key = await this.sshKeysRepo.create({ userId, name, publicKey, fingerprint }, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ssh-key.create',
          resource: 'sshKey',
          resourceId: key.id,
        },
      });
      return { ...key, fingerprint };
    });
  }

  async delete(userId: string, id: string, confirm?: boolean) {
    if (!confirm) throw new NotFoundException('Confirmation required');
    const key = await this.sshKeysRepo.findById(id);
    if (!key || key.userId !== userId) throw new NotFoundException('SSH key not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.sshKeysRepo.softDelete(id, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ssh-key.delete',
          resource: 'sshKey',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }

  async restore(userId: string, id: string) {
    const key = await this.sshKeysRepo.findById(id);
    if (!key || key.userId !== userId || !key.deletedAt) throw new NotFoundException('Deleted SSH key not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.sshKeysRepo.restore(id, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ssh-key.restore',
          resource: 'sshKey',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }

  async hardDelete(userId: string, id: string, confirm?: boolean) {
    if (!confirm) throw new NotFoundException('Confirmation required');
    const key = await this.sshKeysRepo.findById(id);
    if (!key || key.userId !== userId) throw new NotFoundException('SSH key not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.sshKeysRepo.hardDelete(id, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ssh-key.hard-delete',
          resource: 'sshKey',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }
}
