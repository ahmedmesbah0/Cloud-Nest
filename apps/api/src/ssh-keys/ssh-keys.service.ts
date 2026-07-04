import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SshKeysRepository } from './ssh-keys.repository';

@Injectable()
export class SshKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sshKeysRepo: SshKeysRepository,
  ) {}

  async list(userId: string) {
    return this.sshKeysRepo.findMany(userId);
  }

  async create(userId: string, name: string, publicKey: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const key = await this.sshKeysRepo.create({ userId, name, publicKey }, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ssh-key.create',
          resource: 'sshKey',
          resourceId: key.id,
        },
      });
      return key;
    });
  }

  async delete(userId: string, id: string) {
    const key = await this.sshKeysRepo.findById(id);
    if (!key || key.userId !== userId) throw new NotFoundException('SSH key not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.sshKeysRepo.delete(id, tx);
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
}
