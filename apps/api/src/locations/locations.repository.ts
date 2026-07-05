import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async create(data: { name: string; region: string; country: string; datacenter?: string }, tx?: PrismaTx) {
    return this.db(tx).location.create({ data, include: { _count: { select: { nodes: true } } } });
  }

  async findAll(tx?: PrismaTx) {
    return this.db(tx).location.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { nodes: true } } },
    });
  }

  async findById(id: string, tx?: PrismaTx) {
    return this.db(tx).location.findUnique({
      where: { id },
      include: { nodes: { select: { id: true, name: true, status: true, isActive: true } } },
    });
  }

  async update(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).location.update({
      where: { id },
      data,
      include: { _count: { select: { nodes: true } } },
    });
  }

  async delete(id: string, tx?: PrismaTx) {
    return this.db(tx).location.delete({ where: { id } });
  }

  async countLocations(tx?: PrismaTx) {
    return this.db(tx).location.count();
  }
}
