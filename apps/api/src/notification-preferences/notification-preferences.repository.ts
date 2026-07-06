import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class NotificationPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findByUserId(userId: string) {
    return this.db().notificationPreference.findMany({ where: { userId } });
  }

  async upsert(userId: string, type: string, muted: boolean) {
    return this.db().notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      update: { muted },
      create: { userId, type, muted },
    });
  }

  async findMutedTypes(userId: string): Promise<string[]> {
    const prefs = await this.db().notificationPreference.findMany({
      where: { userId, muted: true },
    });
    return prefs.map((p: any) => p.type);
  }
}
