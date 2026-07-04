import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class SshKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findMany(userId: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.findUnique({ where: { id } });
  }

  async create(data: { userId: string; name: string; publicKey: string }, tx?: PrismaTx) {
    return this.db(tx).sshKey.create({ data });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).sshKey.delete({ where: { id } });
  }
}
