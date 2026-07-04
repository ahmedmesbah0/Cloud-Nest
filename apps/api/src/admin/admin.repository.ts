import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  // --- User ---
  async countUsers(tx?: PrismaTx) {
    return this.db(tx).user.count();
  }

  async findUsersRecent(tx?: PrismaTx) {
    return this.db(tx).user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async findUsers(skip: number, take: number, tx?: PrismaTx) {
    return this.db(tx).user.findMany({
      skip, take,
      orderBy: { createdAt: 'desc' },
      include: { roles: { include: { role: true } }, _count: { select: { vms: true } } },
    });
  }

  async findUserById(id: string, tx?: PrismaTx) {
    return this.db(tx).user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
        vms: { orderBy: { createdAt: 'desc' } },
        _count: { select: { vms: true, sessions: true, apiKeys: true, sshKeys: true } },
      },
    });
  }

  async findUserBasic(id: string, tx?: PrismaTx) {
    return this.db(tx).user.findUnique({ where: { id } });
  }

  async updateUser(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).user.update({ where: { id }, data });
  }

  async findManyUserIds(tx?: PrismaTx) {
    return this.db(tx).user.findMany({ select: { id: true } });
  }

  // --- VM ---
  async countVms(tx?: PrismaTx) {
    return this.db(tx).vm.count();
  }

  async countVmsByStatus(status: string, tx?: PrismaTx) {
    return this.db(tx).vm.count({ where: { status } });
  }

  async findRecentVms(tx?: PrismaTx) {
    return this.db(tx).vm.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { email: true, name: true } } },
    });
  }

  async findVmById(id: string, tx?: PrismaTx) {
    return this.db(tx).vm.findUnique({ where: { id } });
  }

  async findVmWithDetails(id: string, tx?: PrismaTx) {
    return this.db(tx).vm.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        node: { select: { id: true, name: true, proxmoxNodeId: true } },
        snapshots: { orderBy: { createdAt: 'desc' } },
        backups: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { snapshots: true, backups: true } },
      },
    });
  }

  async findVms(skip: number, take: number, tx?: PrismaTx) {
    return this.db(tx).vm.findMany({
      skip, take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } },
    });
  }

  async updateVm(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).vm.update({ where: { id }, data });
  }

  async deleteVm(id: string, tx?: PrismaTx) {
    return this.db(tx).vm.delete({ where: { id } });
  }

  // --- Node ---
  async countNodes(tx?: PrismaTx) {
    return this.db(tx).node.count();
  }

  async findNodes(tx?: PrismaTx) {
    return this.db(tx).node.findMany({ include: { inventory: true, storagePools: true } });
  }

  async findNodeById(id: string, tx?: PrismaTx) {
    return this.db(tx).node.findUnique({
      where: { id },
      include: { inventory: true, storagePools: true, vms: { take: 50 } },
    });
  }

  async findNodeByProxmoxId(proxmoxNodeId: string, tx?: PrismaTx) {
    return this.db(tx).node.findUnique({ where: { proxmoxNodeId } });
  }

  async findFirstActiveNode(tx?: PrismaTx) {
    return this.db(tx).node.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createNode(data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).node.create({ data });
  }

  async updateNode(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).node.update({ where: { id }, data });
  }

  // --- Wallet ---
  async countWallets(tx?: PrismaTx) {
    return this.db(tx).wallet.count();
  }

  async aggregateWalletBalance(tx?: PrismaTx) {
    return this.db(tx).wallet.aggregate({ _sum: { balance: true } });
  }

  async upsertWallet(userId: string, create: Record<string, unknown>, update: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).wallet.upsert({ where: { userId }, create, update });
  }

  // --- Transaction ---
  async createTransaction(data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).transaction.create({ data });
  }

  // --- ResourcePool ---
  async findPoolById(id: string, tx?: PrismaTx) {
    return this.db(tx).resourcePool.findUnique({ where: { id } });
  }

  async findPoolByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).resourcePool.findFirst({ where: { userId } });
  }

  async findResourceAllocationByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).resourceAllocation.findUnique({ where: { vmId } });
  }

  async findResourceAllocationsByPool(poolId: string, excludeVmId?: string, tx?: PrismaTx) {
    const where: any = { poolId };
    if (excludeVmId) where.vmId = { not: excludeVmId };
    return this.db(tx).resourceAllocation.findMany({ where });
  }

  // --- VmTemplate ---
  async findTemplateById(id: string, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findUnique({ where: { id } });
  }

  async findTemplates(skip: number, take: number, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findMany({ skip, take, orderBy: { name: 'asc' } });
  }

  async countTemplates(tx?: PrismaTx) {
    return this.db(tx).vmTemplate.count();
  }

  async findActiveTemplates(tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findMany({ where: { isActive: true } });
  }

  async findAllTemplates(tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findMany();
  }

  async createTemplate(data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.create({ data });
  }

  async updateTemplate(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.delete({ where: { id } });
  }

  // --- Setting ---
  async findSettings(tx?: PrismaTx) {
    return this.db(tx).setting.findMany();
  }

  async findSettingByKey(key: string, tx?: PrismaTx) {
    return this.db(tx).setting.findUnique({ where: { key } });
  }

  async upsertSetting(key: string, value: string, tx?: PrismaTx) {
    return this.db(tx).setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  async deleteSetting(key: string, tx?: PrismaTx) {
    return this.db(tx).setting.delete({ where: { key } });
  }

  async findSettingsByPrefix(prefix: string, tx?: PrismaTx) {
    return this.db(tx).setting.findMany({
      where: { key: { startsWith: prefix } },
    });
  }

  // --- AuditLog ---
  async findAuditLogs(skip: number, take: number, tx?: PrismaTx) {
    return this.db(tx).auditLog.findMany({
      skip, take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } },
    });
  }

  async countAuditLogs(tx?: PrismaTx) {
    return this.db(tx).auditLog.count();
  }

  // --- Role ---
  async findRoleByName(name: string, tx?: PrismaTx) {
    return this.db(tx).role.findUnique({ where: { name } });
  }

  async findRoleById(id: string, tx?: PrismaTx) {
    return this.db(tx).role.findUnique({ where: { id } });
  }

  async findRoles(tx?: PrismaTx) {
    return this.db(tx).role.findMany({
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
  }

  async createRole(data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).role.create({ data });
  }

  async upsertRole(where: Record<string, unknown>, create: Record<string, unknown>, update: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).role.upsert({ where, create, update });
  }

  async updateRole(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).role.update({ where: { id }, data });
  }

  async deleteRole(id: string, tx?: PrismaTx) {
    return this.db(tx).role.delete({ where: { id } });
  }

  async findRoleWithPermissions(id: string, tx?: PrismaTx) {
    return this.db(tx).role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
  }

  // --- UserRole ---
  async findUserRole(userId: string, roleId: string, tx?: PrismaTx) {
    return this.db(tx).userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
  }

  async createUserRole(data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).userRole.create({ data });
  }

  async deleteUserRoles(userId: string, roleId: string, tx?: PrismaTx) {
    return this.db(tx).userRole.deleteMany({ where: { userId, roleId } });
  }

  // --- Permission ---
  async findPermissions(tx?: PrismaTx) {
    return this.db(tx).permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async findPermissionById(id: string, tx?: PrismaTx) {
    return this.db(tx).permission.findUnique({ where: { id } });
  }

  // --- RolePermission ---
  async findRolePermission(roleId: string, permissionId: string, tx?: PrismaTx) {
    return this.db(tx).rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId } },
    });
  }

  async upsertRolePermission(roleId: string, permissionId: string, tx?: PrismaTx) {
    return this.db(tx).rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });
  }

  async deleteRolePermission(id: string, tx?: PrismaTx) {
    return this.db(tx).rolePermission.delete({ where: { id } });
  }

  // --- SupportTicket ---
  async findTickets(where: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).supportTicket.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { messages: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findTicketById(id: string, tx?: PrismaTx) {
    return this.db(tx).supportTicket.findUnique({ where: { id } });
  }

  async findTicketWithMessages(id: string, tx?: PrismaTx) {
    return this.db(tx).supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async createTicketMessage(data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).supportTicketMessage.create({ data });
  }

  async updateTicket(id: string, data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).supportTicket.update({ where: { id }, data });
  }

  // --- VM ---
  async createVm(data: {
    userId: string; name: string; status: string; proxmoxId: number;
    nodeId: string; cpuCores: number; memoryMb: number; diskGb: number; templateId: string;
  }, tx?: PrismaTx) {
    return this.db(tx).vm.create({ data });
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

  // --- Notification ---
  async createNotification(data: Record<string, unknown>, tx?: PrismaTx) {
    return this.db(tx).notification.create({ data });
  }

  async createManyNotifications(data: Array<Record<string, unknown>>, tx?: PrismaTx) {
    return this.db(tx).notification.createMany({ data });
  }
}
