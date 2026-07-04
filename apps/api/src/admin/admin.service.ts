import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proxmoxService: ProxmoxService,
    private readonly poolService: ResourcePoolService,
    private readonly jobService: ProxmoxJobService,
    private readonly jwtService: JwtService,
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

  async adminCreateVm(adminUserId: string, dto: {
    userId: string;
    name: string;
    poolId?: string;
    templateId: string;
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
    sshKeyId?: string;
  }) {
    const targetUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!targetUser) throw new BadRequestException('Target user not found');

    let poolId = dto.poolId;
    if (!poolId) {
      const pool = await this.prisma.resourcePool.findFirst({ where: { userId: dto.userId } });
      if (!pool) throw new BadRequestException('Target user has no resource pool');
      poolId = pool.id;
    }

    const pool = await this.prisma.resourcePool.findUnique({ where: { id: poolId } });
    if (!pool) throw new BadRequestException('Resource pool not found');

    const template = await this.prisma.vmTemplate.findUnique({ where: { id: dto.templateId } });
    if (!template) throw new BadRequestException('Template not found');

    const defaultNode = await this.prisma.node.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultNode) throw new BadRequestException('No active node available');

    const vmid = await this.proxmoxService.getNextVmid();

    const vm = await this.prisma.$transaction(async (tx: any) => {
      const vm = await tx.vm.create({
        data: {
          userId: dto.userId,
          name: dto.name,
          status: 'provisioning',
          proxmoxId: vmid,
          nodeId: defaultNode.id,
          cpuCores: dto.cpuCores,
          memoryMb: dto.memoryMb,
          diskGb: dto.diskGb,
          templateId: dto.templateId,
        },
      });

      await this.poolService.allocateResources({
        poolId,
        vmId: vm.id,
        cores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskGb: dto.diskGb,
      }, tx);

      const availableIp = await tx.ipAddress.findFirst({
        where: { isAssigned: false, vmId: null },
        orderBy: { address: 'asc' },
      });
      if (availableIp) {
        await tx.ipAddress.update({
          where: { id: availableIp.id },
          data: { isAssigned: true, vmId: vm.id },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'admin.vm.create',
          resource: 'vm',
          resourceId: vm.id,
          metadata: { targetUserId: dto.userId, name: dto.name, templateId: dto.templateId, cpuCores: dto.cpuCores, memoryMb: dto.memoryMb, diskGb: dto.diskGb, vmid, node: defaultNode.id },
        },
      });

      return vm;
    });

    await this.jobService.enqueueJob('create-vm', {
      vmId: vm.id,
      vmid,
      name: dto.name,
      cores: dto.cpuCores,
      memory: dto.memoryMb,
      disk: dto.diskGb,
      templateVmid: Number(template.proxmoxTemplateId),
      node: defaultNode.proxmoxNodeId,
    }, {
      userId: adminUserId,
      auditLog: { action: 'admin.vm.provision', resource: 'vm', resourceId: vm.id },
    });

    return vm;
  }

  async getAdminVm(vmId: string) {
    const vm = await this.prisma.vm.findUnique({
      where: { id: vmId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        node: { select: { id: true, name: true, proxmoxNodeId: true } },
        snapshots: { orderBy: { createdAt: 'desc' } },
        backups: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { snapshots: true, backups: true } },
      },
    });
    if (!vm) throw new NotFoundException('VM not found');
    return vm;
  }

  async adminPowerAction(adminUserId: string, vmId: string, action: 'start' | 'stop' | 'restart' | 'shutdown') {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');

    if (vm.status !== 'running' && vm.status !== 'stopped') {
      throw new BadRequestException(`Cannot ${action} VM in ${vm.status} state`);
    }
    if (action === 'start' && vm.status === 'running') {
      throw new BadRequestException('VM is already running');
    }
    if ((action === 'stop' || action === 'shutdown') && vm.status === 'stopped') {
      throw new BadRequestException('VM is already stopped');
    }
    if (action === 'restart' && vm.status !== 'running') {
      throw new BadRequestException('Can only restart a running VM');
    }

    const jobType = action === 'shutdown' ? 'shutdown-vm' : `${action}-vm`;

    await this.jobService.enqueueJob(jobType as any, {
      vmId: vm.id,
      proxmoxId: vm.proxmoxId,
    }, {
      userId: adminUserId,
      auditLog: { action: `admin.vm.${action}`, resource: 'vm', resourceId: vm.id },
    });

    return { message: `${action} command queued` };
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

  async listTemplates(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [templates, total] = await Promise.all([
      this.prisma.vmTemplate.findMany({
        skip, take: limit, orderBy: { name: 'asc' },
      }),
      this.prisma.vmTemplate.count(),
    ]);
    return { templates, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createTemplate(adminUserId: string, data: { name: string; proxmoxTemplateId: string; osType: string; minDiskGb: number; minMemoryMb: number }) {
    const template = await this.prisma.vmTemplate.create({ data });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.template.create',
        resource: 'template', resourceId: template.id,
        metadata: { name: data.name, proxmoxTemplateId: data.proxmoxTemplateId } as any,
      },
    });
    return template;
  }

  async updateTemplate(adminUserId: string, id: string, data: { name?: string; isActive?: boolean; minDiskGb?: number; minMemoryMb?: number }) {
    const template = await this.prisma.vmTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    const result = await this.prisma.vmTemplate.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.template.update',
        resource: 'template', resourceId: id,
        metadata: { changes: data } as any,
      },
    });
    return result;
  }

  async deleteTemplate(adminUserId: string, id: string) {
    const template = await this.prisma.vmTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    await this.prisma.vmTemplate.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.template.delete',
        resource: 'template', resourceId: id,
      },
    });
    return { success: true };
  }

  async toggleNodeMaintenance(adminUserId: string, nodeId: string, isActive: boolean) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');
    const result = await this.prisma.node.update({ where: { id: nodeId }, data: { isActive } });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: `admin.node.${isActive ? 'activate' : 'maintenance'}`,
        resource: 'node', resourceId: nodeId,
      },
    });
    return result;
  }

  async renameVm(adminUserId: string, vmId: string, name: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');
    const result = await this.prisma.vm.update({ where: { id: vmId }, data: { name } });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.vm.rename',
        resource: 'vm', resourceId: vmId,
        metadata: { oldName: vm.name, newName: name } as any,
      },
    });
    return result;
  }

  async impersonateUser(adminUserId: string, targetUserId: string) {
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new NotFoundException('User not found');

    const accessToken = this.jwtService.sign(
      { sub: targetUser.id, email: targetUser.email, impersonatorId: adminUserId },
    );

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.user.impersonate',
        resource: 'user', resourceId: targetUserId,
      },
    });

    return { accessToken, user: { id: targetUser.id, email: targetUser.email, name: targetUser.name } };
  }

  async migrateVm(adminUserId: string, vmId: string, targetNodeId: string, online?: boolean) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID');

    const targetNode = await this.prisma.node.findUnique({ where: { id: targetNodeId } });
    if (!targetNode) throw new NotFoundException('Target node not found');

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.vm.migrate',
        resource: 'vm', resourceId: vmId,
        metadata: { targetNode: targetNode.proxmoxNodeId, online: online ?? false } as any,
      },
    });

    await this.jobService.enqueueJob('migrate-vm', {
      vmId: vm.id,
      vmid: vm.proxmoxId,
      targetNode: targetNode.proxmoxNodeId,
      online: online ?? false,
      node: vm.nodeId,
    }, {
      userId: adminUserId,
      auditLog: { action: 'admin.vm.migrate', resource: 'vm', resourceId: vm.id },
    });

    return { message: 'Migration queued' };
  }

  async getProxmoxTemplates() {
    if (!this.proxmoxService['initialized']) {
      return this.prisma.vmTemplate.findMany({ where: { isActive: true } });
    }
    try {
      const proxmoxTemplates = await this.proxmoxService.getTemplates();
      const dbTemplates = await this.prisma.vmTemplate.findMany();
      return { proxmox: proxmoxTemplates, db: dbTemplates };
    } catch {
      return this.prisma.vmTemplate.findMany({ where: { isActive: true } });
    }
  }

  async setBillingPricing(_adminUserId: string, prices: Record<string, number>) {
    const results: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(prices)) {
      const settingKey = `pricing_${key}`;
      results[key] = await this.setSetting(settingKey, String(value));
    }
    return results;
  }

  async getBillingPricing() {
    const settings = await this.prisma.setting.findMany({
      where: { key: { startsWith: 'pricing_' } },
    });
    const prices: Record<string, string> = {};
    for (const s of settings) {
      prices[s.key.replace('pricing_', '')] = s.value;
    }
    return prices;
  }

  async getProxmoxStorage(node: string) {
    try {
      const storage = await this.proxmoxService.getStoragePools(node);
      return storage;
    } catch {
      return [];
    }
  }

  async getVmFirewall(vmId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) return [];
    try {
      return await this.proxmoxService.getFirewallRules(vm.nodeId, vm.proxmoxId);
    } catch {
      return [];
    }
  }

  async addVmFirewall(adminUserId: string, vmId: string, rule: Record<string, unknown>) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID');
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.vm.firewall.add',
        resource: 'vm', resourceId: vmId,
        metadata: { rule } as any,
      },
    });
    return this.proxmoxService.addFirewallRule(vm.nodeId, vm.proxmoxId, rule);
  }

  async deleteVmFirewall(adminUserId: string, vmId: string, pos: number) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID');
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.vm.firewall.delete',
        resource: 'vm', resourceId: vmId,
        metadata: { pos } as any,
      },
    });
    return this.proxmoxService.deleteFirewallRule(vm.nodeId, vm.proxmoxId, pos);
  }

  async adminReinstallVm(adminUserId: string, vmId: string, templateId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');
    const template = await this.prisma.vmTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new BadRequestException('Template not found');

    await this.prisma.vm.update({
      where: { id: vmId },
      data: { status: 'provisioning' },
    });

    await this.jobService.enqueueJob('reinstall-vm', {
      vmId,
      proxmoxId: vm.proxmoxId,
      templateVmid: Number(template.proxmoxTemplateId),
    }, {
      userId: adminUserId,
      auditLog: { action: 'admin.vm.reinstall', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Reinstall queued' };
  }

  async adminResizeVm(adminUserId: string, vmId: string, dto: { cpuCores?: number; memoryMb?: number; diskGb?: number }) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM not found');

    await this.jobService.enqueueJob('resize-vm', {
      vmId,
      proxmoxId: vm.proxmoxId,
      cores: dto.cpuCores ?? vm.cpuCores,
      memory: dto.memoryMb ?? vm.memoryMb,
      disk: dto.diskGb ?? vm.diskGb,
      node: vm.nodeId,
    }, {
      userId: adminUserId,
      auditLog: { action: 'admin.vm.resize', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Resize queued' };
  }

  // --- Roles CRUD ---

  async createRole(adminUserId: string, data: { name: string; description?: string }) {
    const existing = await this.prisma.role.findUnique({ where: { name: data.name } });
    if (existing) throw new BadRequestException('Role already exists');
    const role = await this.prisma.role.create({ data: { name: data.name, description: data.description } });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.role.create', resource: 'role', resourceId: role.id, metadata: data as any },
    });
    return role;
  }

  async updateRole(adminUserId: string, roleId: string, data: { name?: string; description?: string }) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (data.name && data.name !== role.name) {
      const existing = await this.prisma.role.findUnique({ where: { name: data.name } });
      if (existing) throw new BadRequestException('Role name already taken');
    }
    const updated = await this.prisma.role.update({ where: { id: roleId }, data });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.role.update', resource: 'role', resourceId: roleId, metadata: data as any },
    });
    return updated;
  }

  async deleteRole(adminUserId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.name === 'admin') throw new BadRequestException('Cannot delete the admin role');
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.role.delete', resource: 'role', resourceId: roleId },
    });
    return { message: 'Role deleted' };
  }

  async getRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] });
  }

  async addRolePermission(adminUserId: string, roleId: string, permissionId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    const perm = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!perm) throw new NotFoundException('Permission not found');
    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.role.add-permission', resource: 'role', resourceId: roleId, metadata: { permissionId } as any },
    });
    return { message: 'Permission added to role' };
  }

  async removeRolePermission(adminUserId: string, roleId: string, permissionId: string) {
    const rp = await this.prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId } },
    });
    if (!rp) throw new NotFoundException('Permission not assigned to role');
    await this.prisma.rolePermission.delete({ where: { id: rp.id } });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.role.remove-permission', resource: 'role', resourceId: roleId, metadata: { permissionId } as any },
    });
    return { message: 'Permission removed from role' };
  }

  // --- Support Tickets (admin) ---

  async adminListTickets(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.supportTicket.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { messages: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async adminGetTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async adminReplyTicket(adminUserId: string, ticketId: string, body: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'closed') throw new BadRequestException('Ticket is closed');
    const msg = await this.prisma.supportTicketMessage.create({
      data: { ticketId, userId: adminUserId, body },
    });
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'open', updatedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.ticket.reply', resource: 'support-ticket', resourceId: ticketId },
    });
    return msg;
  }

  async adminCloseTicket(adminUserId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'closed') throw new BadRequestException('Ticket is already closed');
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'closed', updatedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.ticket.close', resource: 'support-ticket', resourceId: ticketId },
    });
    return { message: 'Ticket closed' };
  }

  async adminReopenTicket(adminUserId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== 'closed') throw new BadRequestException('Ticket is not closed');
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'open', updatedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'admin.ticket.reopen', resource: 'support-ticket', resourceId: ticketId },
    });
    return { message: 'Ticket reopened' };
  }

  async broadcastNotification(adminUserId: string, title: string, body: string, targetUserId?: string) {
    if (targetUserId) {
      await this.prisma.notification.create({ data: { userId: targetUserId, title, body } });
    } else {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      await this.prisma.notification.createMany({
        data: users.map(u => ({ userId: u.id, title, body })),
      });
    }
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId, action: 'admin.notification.broadcast',
        resource: 'notification', metadata: { title, targetUserId: targetUserId ?? 'all' } as any,
      },
    });
    return { message: `Notification sent to ${targetUserId ? 'user' : 'all users'}` };
  }
}
