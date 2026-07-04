import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class VmRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  // --- VM ---

  async createVm(data: {
    userId: string;
    name: string;
    status: string;
    proxmoxId: number;
    nodeId: string;
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
    templateId: string;
  }, tx?: PrismaTx) {
    return this.db(tx).vm.create({ data });
  }

  async findVmById(id: string, tx?: PrismaTx) {
    return this.db(tx).vm.findUnique({ where: { id } });
  }

  async findVmWithIps(id: string, tx?: PrismaTx) {
    return this.db(tx).vm.findUnique({
      where: { id },
      include: { ipAddresses: true },
    });
  }

  async findVmsByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).vm.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateVm(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).vm.update({ where: { id }, data });
  }

  // --- VM Template ---

  async findActiveTemplates(tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findTemplateById(id: string, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findUnique({ where: { id } });
  }

  // --- Resource Pool ---

  async findPoolById(id: string, tx?: PrismaTx) {
    return this.db(tx).resourcePool.findUnique({ where: { id } });
  }

  // --- Node ---

  async findFirstActiveNode(tx?: PrismaTx) {
    return this.db(tx).node.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findNodeById(id: string, tx?: PrismaTx) {
    return this.db(tx).node.findUnique({ where: { id } });
  }

  // --- IP Address ---

  async findAvailableIp(tx?: PrismaTx) {
    return this.db(tx).ipAddress.findFirst({
      where: { isAssigned: false, vmId: null },
      orderBy: { address: 'asc' },
    });
  }

  async assignIpToVm(ipId: string, vmId: string, tx?: PrismaTx) {
    return this.db(tx).ipAddress.update({
      where: { id: ipId },
      data: { isAssigned: true, vmId },
    });
  }

  // --- Backup ---

  async findBackupsByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).backup.findMany({
      where: { vmId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCompletedBackupsByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).backup.findMany({
      where: { vmId, status: 'completed' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findBackupById(id: string, tx?: PrismaTx) {
    return this.db(tx).backup.findUnique({ where: { id } });
  }

  async findBackupWithVm(id: string, tx?: PrismaTx) {
    return this.db(tx).backup.findUnique({
      where: { id },
      include: { vm: { include: { node: true } } },
    });
  }

  async createBackup(data: {
    vmId: string;
    name: string;
    status: string;
    storage: string;
    nodeId: string | null;
  }, tx?: PrismaTx) {
    return this.db(tx).backup.create({ data });
  }

  async updateBackup(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).backup.update({ where: { id }, data });
  }

  // --- Snapshot ---

  async findSnapshotsByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).snapshot.findMany({
      where: { vmId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSnapshotById(id: string, tx?: PrismaTx) {
    return this.db(tx).snapshot.findUnique({ where: { id } });
  }

  async createSnapshot(data: {
    vmId: string;
    name: string;
    description?: string | null;
    status: string;
    nodeId: string | null;
  }, tx?: PrismaTx) {
    return this.db(tx).snapshot.create({ data });
  }

  async updateSnapshot(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).snapshot.update({ where: { id }, data });
  }

  async deleteSnapshot(id: string, tx?: PrismaTx) {
    return this.db(tx).snapshot.delete({ where: { id } });
  }

  // --- Audit Log ---

  async createAuditLog(data: { userId: string; action: string; resource: string; resourceId?: string; metadata?: any }, tx?: PrismaTx) {
    return this.db(tx).auditLog.create({ data });
  }

  // --- Raw Queries for resize TOCTOU check ---

  async lockUserPools(userId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT id, "totalCores", "totalMemoryMb", "totalDiskGb" FROM "ResourcePool" WHERE "userId" = $1 FOR UPDATE`,
      userId,
    ) as Promise<Array<{ id: string; totalCores: number; totalMemoryMb: number; totalDiskGb: number }>>;
  }

  async sumAllocationsExcludingVm(poolId: string, vmId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT COALESCE(SUM(cores), 0) as cores, COALESCE(SUM("memoryMb"), 0) as "memoryMb", COALESCE(SUM("diskGb"), 0) as "diskGb" FROM "ResourceAllocation" WHERE "poolId" = $1 AND "vmId" != $2`,
      poolId, vmId,
    ) as Promise<Array<{ cores: number; memoryMb: number; diskGb: number }>>;
  }

  async findAllocationByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).$queryRawUnsafe(
      `SELECT cores, "memoryMb", "diskGb" FROM "ResourceAllocation" WHERE "vmId" = $1`,
      vmId,
    ) as Promise<Array<{ cores: number; memoryMb: number; diskGb: number }>>;
  }
}
