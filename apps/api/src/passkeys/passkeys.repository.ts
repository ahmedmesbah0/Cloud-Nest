import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class PasskeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findByUserId(userId: string) {
    return this.db().passkey.findMany({
      where: { userId },
      select: {
        id: true,
        deviceName: true,
        createdAt: true,
        credentialId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.db().passkey.findUnique({ where: { id } });
  }

  async findByCredentialId(credentialId: string) {
    return this.db().passkey.findUnique({ where: { credentialId } });
  }

  async create(data: {
    userId: string;
    credentialId: string;
    publicKey: Buffer;
    counter: number;
    transports?: string;
    deviceName: string;
  }) {
    return this.db().passkey.create({ data });
  }

  async updateCounter(id: string, counter: number) {
    return this.db().passkey.update({ where: { id }, data: { counter } });
  }

  async delete(id: string) {
    return this.db().passkey.delete({ where: { id } });
  }
}
