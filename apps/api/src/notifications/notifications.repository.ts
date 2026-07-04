import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findMany(userId: string, skip: number, take: number, tx?: PrismaTx) {
    return this.db(tx).notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async count(userId: string, isRead?: boolean, tx?: PrismaTx) {
    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;
    return this.db(tx).notification.count({ where });
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).notification.findUnique({ where: { id } });
  }

  async update(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).notification.update({ where: { id }, data });
  }

  async updateMany(where: any, data: any, tx?: PrismaTx) {
    return this.db(tx).notification.updateMany({ where, data });
  }

  async create(data: { userId: string; title: string; body: string }, tx?: PrismaTx) {
    return this.db(tx).notification.create({ data });
  }
}
