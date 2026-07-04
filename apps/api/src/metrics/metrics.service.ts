import { Injectable, Logger } from '@nestjs/common';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { MetricsRepository } from './metrics.repository';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly metricsRepository: MetricsRepository,
    private readonly proxmox: ProxmoxService,
  ) {}

  async collectAllMetrics() {
    const nodes = await this.metricsRepository.findActiveNodes();
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
          const dbVm = await this.metricsRepository.findVmByProxmoxId(vm.vmid, node.id);
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
      await this.metricsRepository.createResourceMetrics(records);
    }

    this.logger.log(`Collected ${records.length} metric records`);
    return { collected: records.length };
  }

  async getVmMetrics(vmId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsRepository.findVmMetrics(vmId, since);
  }

  async getNodeMetrics(nodeId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsRepository.findNodeMetrics(nodeId, since);
  }

  async getAggregatedMetrics(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const vmMetrics = await this.metricsRepository.groupVmMetrics(since);
    const nodeMetrics = await this.metricsRepository.groupNodeMetrics(since);

    return { vmMetrics, nodeMetrics };
  }
}
