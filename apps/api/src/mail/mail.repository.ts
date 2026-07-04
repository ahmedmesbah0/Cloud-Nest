import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class MailRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findSettingsByKeys(keys: string[], tx?: PrismaTx) {
    return this.db(tx).setting.findMany({
      where: { key: { in: keys } },
    });
  }

  async findSettingByKey(key: string, tx?: PrismaTx) {
    return this.db(tx).setting.findUnique({ where: { key } });
  }
}
