import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class BillingProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).billingProfile.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: any, tx?: PrismaTx) {
    return this.db(tx).billingProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
