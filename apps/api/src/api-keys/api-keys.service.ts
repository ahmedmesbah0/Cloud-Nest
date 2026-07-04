import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'node:crypto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, key: true, lastUsedAt: true, createdAt: true },
    });
  }

  async create(userId: string, name: string) {
    const rawKey = `cn_${randomBytes(32).toString('hex')}`;
    const key = await this.prisma.apiKey.create({
      data: { userId, name, key: rawKey },
    });
    return { id: key.id, name: key.name, key: key.key, createdAt: key.createdAt };
  }

  async delete(userId: string, id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== userId) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.delete({ where: { id } });
    return { success: true };
  }
}
