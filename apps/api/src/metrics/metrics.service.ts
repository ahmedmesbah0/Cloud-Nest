import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxService } from '../proxmox/proxmox.service';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proxmox: ProxmoxService,
  ) {}

  async collectAllMetrics() {
    const nodes = await this.prisma.node.findMany({ where: { isActive: true } });
    const records: Array<{ vmId?: string; nodeId?: string; cpuUsage: number | null; memoryUsedMb: number | null; diskUsedGb: number | null }> = [];

    for (const node of nodes) {
      try {
        const nodeStatus = await this.proxmox.getNodeStatus(node.proxmoxNodeId);
        records.push({
          nodeId: node.id,
          cpuUsage: Math.round(nodeStatus.cpu * 100 * 100) / 100,
          memoryUsedMb: Math.round((nodeStatus.mem / 1024 / 1024) * 100) / 100,
          diskUsedGb: Math.round((nodeStatus.disk / 1024 / 1024 / 1024) * 100) / 100,
        });

        const vms = await this.proxmox.getVms(node.proxmoxNodeId);
        for (const vm of vms) {
          const dbVm = await this.prisma.vm.findFirst({
            where: { proxmoxId: vm.vmid, nodeId: node.id },
          });
          if (dbVm) {
            records.push({
              vmId: dbVm.id,
              cpuUsage: Math.round(vm.cpus * 100 * 100) / 100,
              memoryUsedMb: Math.round((vm.mem / 1024 / 1024) * 100) / 100,
              diskUsedGb: Math.round((vm.disk / 1024 / 1024 / 1024) * 100) / 100,
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to collect metrics for node ${node.proxmoxNodeId}: ${(err as Error).message}`);
      }
    }

    if (records.length > 0) {
      await this.prisma.resourceMetric.createMany({ data: records });
    }

    this.logger.log(`Collected ${records.length} metric records`);
    return { collected: records.length };
  }

  async getVmMetrics(vmId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.prisma.resourceMetric.findMany({
      where: { vmId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async getNodeMetrics(nodeId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.prisma.resourceMetric.findMany({
      where: { nodeId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async getAggregatedMetrics(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const vmMetrics = await this.prisma.resourceMetric.groupBy({
      by: ['recordedAt'],
      where: { vmId: { not: null }, recordedAt: { gte: since } },
      _avg: { cpuUsage: true, memoryUsedMb: true, diskUsedGb: true },
      orderBy: { recordedAt: 'asc' },
    });

    const nodeMetrics = await this.prisma.resourceMetric.groupBy({
      by: ['recordedAt'],
      where: { nodeId: { not: null }, recordedAt: { gte: since } },
      _avg: { cpuUsage: true, memoryUsedMb: true, diskUsedGb: true },
      orderBy: { recordedAt: 'asc' },
    });

    return { vmMetrics, nodeMetrics };
  }
}
