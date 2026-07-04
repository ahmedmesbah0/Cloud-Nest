import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SshKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.sshKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, name: string, publicKey: string) {
    return this.prisma.sshKey.create({
      data: { userId, name, publicKey },
    });
  }

  async delete(userId: string, id: string) {
    const key = await this.prisma.sshKey.findUnique({ where: { id } });
    if (!key || key.userId !== userId) throw new NotFoundException('SSH key not found');
    await this.prisma.sshKey.delete({ where: { id } });
    return { success: true };
  }
}
