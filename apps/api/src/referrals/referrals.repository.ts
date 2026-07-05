import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class ReferralsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findCodeById(id: string, tx?: PrismaTx) {
    return this.db(tx).referralCode.findUnique({
      where: { id },
      include: { usage: true, user: { select: { id: true, name: true, email: true } } },
    });
  }

  async findCodeByString(code: string, tx?: PrismaTx) {
    return this.db(tx).referralCode.findUnique({
      where: { code },
      include: { usage: true },
    });
  }

  async findCodeByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).referralCode.findUnique({
      where: { userId },
      include: { usage: { include: { referredUser: { select: { id: true, name: true, email: true } } } } },
    });
  }

  async createCode(data: any, tx?: PrismaTx) {
    return this.db(tx).referralCode.create({ data });
  }

  async updateCode(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).referralCode.update({ where: { id }, data });
  }

  async deleteCode(id: string, tx?: PrismaTx) {
    return this.db(tx).referralCode.delete({ where: { id } });
  }

  async findUsageById(id: string, tx?: PrismaTx) {
    return this.db(tx).referralUsage.findUnique({
      where: { id },
      include: { code: true, referredUser: { select: { id: true, name: true, email: true } } },
    });
  }

  async findUsageByCode(codeId: string, tx?: PrismaTx) {
    return this.db(tx).referralUsage.findMany({
      where: { codeId },
      include: { referredUser: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUsageByReferredUser(referredUserId: string, tx?: PrismaTx) {
    return this.db(tx).referralUsage.findFirst({
      where: { referredUserId },
    });
  }

  async createUsage(data: any, tx?: PrismaTx) {
    return this.db(tx).referralUsage.create({ data });
  }

  async countUsageByCode(codeId: string, tx?: PrismaTx) {
    return this.db(tx).referralUsage.count({ where: { codeId } });
  }

  async findAllCodesWithUsage(tx?: PrismaTx) {
    return this.db(tx).referralCode.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        usage: { include: { referredUser: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
