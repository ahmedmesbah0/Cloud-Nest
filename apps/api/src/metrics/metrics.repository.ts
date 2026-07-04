import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class MetricsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findActiveNodes(tx?: PrismaTx) {
    return this.db(tx).node.findMany({ where: { isActive: true } });
  }

  async findVmByProxmoxId(proxmoxId: number, nodeId: string, tx?: PrismaTx) {
    return this.db(tx).vm.findFirst({ where: { proxmoxId, nodeId } });
  }

  async createResourceMetrics(data: Array<{ vmId?: string; nodeId?: string; cpuUsage: number | null; memoryUsedMb: number | null; diskUsedGb: number | null }>, tx?: PrismaTx) {
    return this.db(tx).resourceMetric.createMany({ data });
  }

  async findVmMetrics(vmId: string, since: Date, tx?: PrismaTx) {
    return this.db(tx).resourceMetric.findMany({
      where: { vmId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async findNodeMetrics(nodeId: string, since: Date, tx?: PrismaTx) {
    return this.db(tx).resourceMetric.findMany({
      where: { nodeId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async groupVmMetrics(since: Date, tx?: PrismaTx) {
    return this.db(tx).resourceMetric.groupBy({
      by: ['recordedAt'],
      where: { vmId: { not: null }, recordedAt: { gte: since } },
      _avg: { cpuUsage: true, memoryUsedMb: true, diskUsedGb: true },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async groupNodeMetrics(since: Date, tx?: PrismaTx) {
    return this.db(tx).resourceMetric.groupBy({
      by: ['recordedAt'],
      where: { nodeId: { not: null }, recordedAt: { gte: since } },
      _avg: { cpuUsage: true, memoryUsedMb: true, diskUsedGb: true },
      orderBy: { recordedAt: 'asc' },
    });
  }
}
