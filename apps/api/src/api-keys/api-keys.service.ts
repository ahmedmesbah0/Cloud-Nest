import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysRepository } from './api-keys.repository';
import { randomBytes } from 'node:crypto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeysRepo: ApiKeysRepository,
  ) {}

  async list(userId: string) {
    return this.apiKeysRepo.findMany(userId);
  }

  async create(userId: string, name: string) {
    const rawKey = `cn_${randomBytes(32).toString('hex')}`;
    const key = await this.prisma.$transaction(async (tx: any) => {
      const k = await this.apiKeysRepo.create({ userId, name, key: rawKey }, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'api-key.create',
          resource: 'apiKey',
          resourceId: k.id,
        },
      });
      return k;
    });
    return { id: key.id, name: key.name, key: key.key, createdAt: key.createdAt };
  }

  async delete(userId: string, id: string) {
    const key = await this.apiKeysRepo.findById(id);
    if (!key || key.userId !== userId) throw new NotFoundException('API key not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.apiKeysRepo.delete(id, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'api-key.delete',
          resource: 'apiKey',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }
}
