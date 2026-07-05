import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class ResourcePackagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).resourcePackage.findUnique({ where: { id } });
  }

  async findMany(where?: any, tx?: PrismaTx) {
    return this.db(tx).resourcePackage.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(data: any, tx?: PrismaTx) {
    return this.db(tx).resourcePackage.create({ data });
  }

  async update(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).resourcePackage.update({ where: { id }, data });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).resourcePackage.delete({ where: { id } });
  }

  async findPurchaseById(id: string, tx?: PrismaTx) {
    return this.db(tx).resourcePackagePurchase.findUnique({
      where: { id },
      include: { package: true },
    });
  }

  async findPurchasesByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).resourcePackagePurchase.findMany({
      where: { userId },
      include: { package: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPurchase(data: any, tx?: PrismaTx) {
    return this.db(tx).resourcePackagePurchase.create({ data });
  }
}
