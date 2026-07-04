import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proxmoxService: ProxmoxService,
    private readonly poolService: ResourcePoolService,
  ) {}

  async getDashboardStats() {
    const [totalUsers, totalVms, totalNodes, activeVms, totalWallets] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.vm.count(),
      this.prisma.node.count(),
      this.prisma.vm.count({ where: { status: 'running' } }),
      this.prisma.wallet.count(),
    ]);

    const totalBalance = await this.prisma.wallet.aggregate({ _sum: { balance: true } });

    return {
      totalUsers, totalVms, totalNodes, activeVms, totalWallets,
      totalBalance: totalBalance._sum.balance ?? 0,
      recentVms: await this.prisma.vm.findMany({
        orderBy: { createdAt: 'desc' }, take: 10,
        include: { user: { select: { email: true, name: true } } },
      }),
      recentUsers: await this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' }, take: 10,
      }),
    };
  }

  async listUsers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } }, _count: { select: { vms: true } } },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
        vms: { orderBy: { createdAt: 'desc' } },
        _count: { select: { vms: true, sessions: true, apiKeys: true, sshKeys: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(adminUserId: string, userId: string, data: { name?: string; emailVerified?: boolean; isActive?: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const result = await this.prisma.user.update({ where: { id: userId }, data });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.user.update',
        resource: 'user', resourceId: userId,
        metadata: { changes: data } as any,
      },
    });

    return result;
  }

  async deactivateUser(adminUserId: string, userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId }, data: { isActive: false },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.user.deactivate',
        resource: 'user', resourceId: userId,
      },
    });

    return user;
  }

  async activateUser(adminUserId: string, userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId }, data: { isActive: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.user.activate',
        resource: 'user', resourceId: userId,
      },
    });

    return user;
  }

  async listAllVms(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [vms, total] = await Promise.all([
      this.prisma.vm.findMany({
        skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, name: true } } },
      }),
      this.prisma.vm.count(),
    ]);
    return { vms, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async forceStopVm(adminUserId: string, vmId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');

    await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'stopped' } });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.vm.force-stop',
        resource: 'vm', resourceId: vmId,
        metadata: { previousStatus: vm.status } as any,
      },
    });

    return { message: 'VM force-stopped', vmId };
  }

  async forceDeleteVm(adminUserId: string, vmId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');

    await this.poolService.releaseResources(vmId);
    await this.prisma.vm.delete({ where: { id: vmId } });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.vm.force-delete',
        resource: 'vm', resourceId: vmId,
        metadata: { vmName: vm.name, previousStatus: vm.status } as any,
      },
    });

    return { message: 'VM force-deleted' };
  }

  async listNodes() {
    return this.prisma.node.findMany({ include: { inventory: true, storagePools: true } });
  }

  async getNode(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { inventory: true, storagePools: true, vms: { take: 50 } },
    });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  async createNode(adminUserId: string, data: { proxmoxNodeId: string; name: string; host: string; port?: number }) {
    const existing = await this.prisma.node.findUnique({ where: { proxmoxNodeId: data.proxmoxNodeId } });
    if (existing) throw new BadRequestException('Node with this Proxmox ID already exists');

    const node = await this.prisma.node.create({ data });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.node.create',
        resource: 'node', resourceId: node.id,
        metadata: { proxmoxNodeId: data.proxmoxNodeId, host: data.host } as any,
      },
    });

    return node;
  }

  async updateNode(adminUserId: string, nodeId: string, data: { name?: string; host?: string; port?: number; isActive?: boolean }) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const result = await this.prisma.node.update({ where: { id: nodeId }, data });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.node.update',
        resource: 'node', resourceId: nodeId,
        metadata: { changes: data } as any,
      },
    });

    return result;
  }

  async getSettings() {
    const settings = await this.prisma.setting.findMany();
    const result: Record<string, string> = {};
    for (const s of settings) result[s.key] = s.value;
    return result;
  }

  async getSetting(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);
    return setting;
  }

  async setSetting(key: string, value: string) {
    const result = await this.prisma.setting.upsert({
      where: { key }, create: { key, value }, update: { value },
    });
    if (key.startsWith('proxmox_')) await this.proxmoxService.refreshConfig();

    await this.prisma.auditLog.create({
      data: {
        action: 'admin.setting.set',
        resource: 'setting', resourceId: key,
        metadata: { key, value } as any,
      },
    });

    return result;
  }

  async deleteSetting(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);
    await this.prisma.setting.delete({ where: { key } });

    await this.prisma.auditLog.create({
      data: {
        action: 'admin.setting.delete',
        resource: 'setting', resourceId: key,
      },
    });

    return { message: `Setting "${key}" deleted` };
  }

  async getAuditLogs(page = 1, limit = 100) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, name: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);
    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async creditUserWallet(adminUserId: string, userId: string, amount: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const wallet = await this.prisma.wallet.upsert({
      where: { userId }, create: { userId, balance: amount }, update: { balance: { increment: amount } },
    });

    await this.prisma.transaction.create({
      data: { walletId: wallet.id, amount, type: 'credit', reference: 'admin:manual', metadata: { adminAction: true } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.wallet.credit',
        resource: 'wallet', resourceId: wallet.id,
        metadata: { targetUserId: userId, amount } as any,
      },
    });

    return wallet;
  }

  async assignRole(adminUserId: string, userId: string, roleName: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.prisma.role.upsert({
      where: { name: roleName }, create: { name: roleName, description: `Role: ${roleName}` }, update: {},
    });

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
    });

    if (!existing) {
      await this.prisma.userRole.create({ data: { userId, roleId: role.id } });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.role.assign',
        resource: 'user', resourceId: userId,
        metadata: { role: roleName } as any,
      },
    });

    return { message: `Role "${roleName}" assigned to user` };
  }

  async removeRole(adminUserId: string, userId: string, roleName: string) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role "${roleName}" not found`);

    await this.prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.role.remove',
        resource: 'user', resourceId: userId,
        metadata: { role: roleName } as any,
      },
    });

    return { message: `Role "${roleName}" removed from user` };
  }

  async listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
  }
}
