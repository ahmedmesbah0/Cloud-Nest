import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRepository } from './admin.repository';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { ResourcePoolService } from '../resource-pool/resource-pool.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminRepo: AdminRepository,
    private readonly proxmoxService: ProxmoxService,
    private readonly poolService: ResourcePoolService,
    private readonly jobService: ProxmoxJobService,
    private readonly jwtService: JwtService,
  ) {}

  async getDashboardStats() {
    const [totalUsers, totalVms, totalNodes, activeVms, totalWallets] = await Promise.all([
      this.adminRepo.countUsers(),
      this.adminRepo.countVms(),
      this.adminRepo.countNodes(),
      this.adminRepo.countVmsByStatus('running'),
      this.adminRepo.countWallets(),
    ]);

    const totalBalance = await this.adminRepo.aggregateWalletBalance();

    return {
      totalUsers, totalVms, totalNodes, activeVms, totalWallets,
      totalBalance: totalBalance._sum.balance ?? 0,
      recentVms: await this.adminRepo.findRecentVms(),
      recentUsers: await this.adminRepo.findUsersRecent(),
    };
  }

  async listUsers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.adminRepo.findUsers(skip, limit),
      this.adminRepo.countUsers(),
    ]);
    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUser(userId: string) {
    const user = await this.adminRepo.findUserById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(adminUserId: string, userId: string, data: { name?: string; emailVerified?: boolean; isActive?: boolean }) {
    const user = await this.adminRepo.findUserBasic(userId);
    if (!user) throw new NotFoundException('User not found');

    const result = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateUser(userId, data as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.user.update',
          resource: 'user', resourceId: userId,
          metadata: { changes: data } as any,
        },
      });
      return r;
    });

    return result;
  }

  async deactivateUser(adminUserId: string, userId: string) {
    const user = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateUser(userId, { isActive: false } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.user.deactivate',
          resource: 'user', resourceId: userId,
        },
      });
      return r;
    });

    return user;
  }

  async activateUser(adminUserId: string, userId: string) {
    const user = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateUser(userId, { isActive: true } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.user.activate',
          resource: 'user', resourceId: userId,
        },
      });
      return r;
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
    const targetUser = await this.adminRepo.findUserBasic(dto.userId);
    if (!targetUser) throw new BadRequestException('Target user not found');

    let poolId = dto.poolId;
    if (!poolId) {
      const pool = await this.adminRepo.findPoolByUser(dto.userId);
      if (!pool) throw new BadRequestException('Target user has no resource pool');
      poolId = pool.id;
    }

    const pool = await this.adminRepo.findPoolById(poolId!);
    if (!pool) throw new BadRequestException('Resource pool not found');

    const template = await this.adminRepo.findTemplateById(dto.templateId);
    if (!template) throw new BadRequestException('Template not found');

    const defaultNode = await this.adminRepo.findFirstActiveNode();
    if (!defaultNode) throw new BadRequestException('No active node available');

    const vmid = await this.proxmoxService.getNextVmid();

    const vm = await this.prisma.$transaction(async (tx: any) => {
      const vm = await this.adminRepo.createVm({
        userId: dto.userId,
        name: dto.name,
        status: 'provisioning',
        proxmoxId: vmid,
        nodeId: defaultNode.id,
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskGb: dto.diskGb,
        templateId: dto.templateId,
      }, tx);

      await this.poolService.allocateResources({
        poolId: poolId!,
        vmId: vm.id,
        cores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskGb: dto.diskGb,
      }, tx);

      const availableIp = await this.adminRepo.findAvailableIp(tx);
      if (availableIp) {
        await this.adminRepo.assignIpToVm(availableIp.id, vm.id, tx);
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
    const vm = await this.adminRepo.findVmWithDetails(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    return vm;
  }

  async adminPowerAction(adminUserId: string, vmId: string, action: 'start' | 'stop' | 'restart' | 'shutdown') {
    const vm = await this.adminRepo.findVmById(vmId);
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
      this.adminRepo.findVms(skip, limit),
      this.adminRepo.countVms(),
    ]);
    return { vms, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async forceStopVm(adminUserId: string, vmId: string) {
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');

    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.updateVm(vmId, { status: 'stopped' } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.vm.force-stop',
          resource: 'vm', resourceId: vmId,
          metadata: { previousStatus: vm.status } as any,
        },
      });
    });

    return { message: 'VM force-stopped', vmId };
  }

  async forceDeleteVm(adminUserId: string, vmId: string) {
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');

    await this.poolService.releaseResources(vmId);

    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.deleteVm(vmId, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.vm.force-delete',
          resource: 'vm', resourceId: vmId,
          metadata: { vmName: vm.name, previousStatus: vm.status } as any,
        },
      });
    });

    return { message: 'VM force-deleted' };
  }

  async listNodes() {
    return this.adminRepo.findNodes();
  }

  async getNode(nodeId: string) {
    const node = await this.adminRepo.findNodeById(nodeId);
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  async createNode(adminUserId: string, data: { proxmoxNodeId: string; name: string; host: string; port?: number }) {
    const existing = await this.adminRepo.findNodeByProxmoxId(data.proxmoxNodeId);
    if (existing) throw new BadRequestException('Node with this Proxmox ID already exists');

    const node = await this.prisma.$transaction(async (tx: any) => {
      const n = await this.adminRepo.createNode(data as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.node.create',
          resource: 'node', resourceId: n.id,
          metadata: { proxmoxNodeId: data.proxmoxNodeId, host: data.host } as any,
        },
      });
      return n;
    });

    return node;
  }

  async updateNode(adminUserId: string, nodeId: string, data: { name?: string; host?: string; port?: number; isActive?: boolean }) {
    const node = await this.adminRepo.findNodeById(nodeId);
    if (!node) throw new NotFoundException('Node not found');

    const result = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateNode(nodeId, data as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.node.update',
          resource: 'node', resourceId: nodeId,
          metadata: { changes: data } as any,
        },
      });
      return r;
    });

    return result;
  }

  async updateNodeStatus(adminUserId: string, nodeId: string, data: { status: string; locationId?: string }) {
    const node = await this.adminRepo.findNodeById(nodeId);
    if (!node) throw new NotFoundException('Node not found');

    const result = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateNode(nodeId, { status: data.status, lastSeenAt: new Date(), ...(data.locationId !== undefined ? { locationId: data.locationId } : {}) }, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.node.status',
          resource: 'node', resourceId: nodeId,
          metadata: { status: data.status, locationId: data.locationId } as any,
        },
      });
      return r;
    });

    return result;
  }

  async getAnalytics() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [totalUsers, totalVms, activeVms, totalNodes, totalBalance, newUsersThisWeek,
      vmsByStatus, subscriptions, activeSubscriptions, pendingTickets, totalRevenue, paidRevenue] = await Promise.all([
      this.adminRepo.countUsers(),
      this.adminRepo.countVms(),
      this.adminRepo.countVmsByStatus('running'),
      this.adminRepo.countNodes(),
      this.adminRepo.aggregateWalletBalance(),
      this.adminRepo.countUsersCreatedSince(weekAgo),
      this.adminRepo.countVmsByStatusGroup(),
      this.adminRepo.countSubscriptions(),
      this.adminRepo.countActiveSubscriptions(),
      this.adminRepo.countPendingTickets(),
      this.adminRepo.sumInvoiceTotal(),
      this.adminRepo.sumPaidInvoiceTotal(),
    ]);

    return {
      totalUsers, totalVms, activeVms, totalNodes,
      totalWalletBalance: totalBalance._sum.balance ?? 0,
      newUsersThisWeek,
      vmsByStatus,
      subscriptions, activeSubscriptions, pendingTickets,
      totalRevenue, paidRevenue,
    };
  }

  async getSettings() {
    const settings = await this.adminRepo.findSettings();
    const result: Record<string, string> = {};
    for (const s of settings) result[s.key] = s.value;
    return result;
  }

  async getSetting(key: string) {
    const setting = await this.adminRepo.findSettingByKey(key);
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);
    return setting;
  }

  async setSetting(key: string, value: string) {
    const result = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.upsertSetting(key, value, tx);
      await tx.auditLog.create({
        data: {
          action: 'admin.setting.set',
          resource: 'setting', resourceId: key,
          metadata: { key, value } as any,
        },
      });
      return r;
    });
    if (key.startsWith('proxmox_')) await this.proxmoxService.refreshConfig();

    return result;
  }

  async deleteSetting(key: string) {
    const setting = await this.adminRepo.findSettingByKey(key);
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);

    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.deleteSetting(key, tx);
      await tx.auditLog.create({
        data: {
          action: 'admin.setting.delete',
          resource: 'setting', resourceId: key,
        },
      });
    });

    return { message: `Setting "${key}" deleted` };
  }

  async getAuditLogs(page = 1, limit = 100, filters?: { action?: string; resource?: string; userId?: string; startDate?: string; endDate?: string }) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (filters?.action) where.action = { contains: filters.action };
    if (filters?.resource) where.resource = filters.resource;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.startDate || filters?.endDate) {
      const createdAt: Record<string, unknown> = {};
      if (filters.startDate) createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) createdAt.lte = new Date(filters.endDate);
      where.createdAt = createdAt;
    }
    const [logs, total] = await Promise.all([
      this.adminRepo.findAuditLogs(skip, limit, where),
      this.adminRepo.countAuditLogs(where),
    ]);
    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async creditUserWallet(adminUserId: string, userId: string, amount: number, reason?: string) {
    if (adminUserId === userId) throw new ForbiddenException('Cannot credit your own wallet');
    const user = await this.adminRepo.findUserBasic(userId);
    if (!user) throw new NotFoundException('User not found');

    const wallet = await this.prisma.$transaction(async (tx: any) => {
      const w = await this.adminRepo.upsertWallet(
        userId,
        { userId, balance: amount } as Record<string, unknown>,
        { balance: { increment: amount } } as Record<string, unknown>,
        tx,
      );
      await this.adminRepo.createTransaction(
        { walletId: w.id, amount, type: 'credit', reference: 'admin:manual', metadata: { adminAction: true, reason } } as Record<string, unknown>,
        tx,
      );
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.wallet.credit',
          resource: 'wallet', resourceId: w.id,
          metadata: { targetUserId: userId, amount, reason } as any,
        },
      });
      return w;
    });

    return wallet;
  }

  async assignRole(adminUserId: string, userId: string, roleName: string) {
    const user = await this.adminRepo.findUserBasic(userId);
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx: any) => {
      const role = await this.adminRepo.upsertRole(
        { name: roleName },
        { name: roleName, description: `Role: ${roleName}` },
        {},
        tx,
      );

      const existing = await this.adminRepo.findUserRole(userId, role.id, tx);

      if (!existing) {
        await this.adminRepo.createUserRole({ userId, roleId: role.id } as Record<string, unknown>, tx);
      }

      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.role.assign',
          resource: 'user', resourceId: userId,
          metadata: { role: roleName } as any,
        },
      });
    });

    return { message: `Role "${roleName}" assigned to user` };
  }

  async removeRole(adminUserId: string, userId: string, roleName: string) {
    await this.prisma.$transaction(async (tx: any) => {
      const role = await this.adminRepo.findRoleByName(roleName, tx);
      if (!role) throw new NotFoundException(`Role "${roleName}" not found`);

      await this.adminRepo.deleteUserRoles(userId, role.id, tx);

      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.role.remove',
          resource: 'user', resourceId: userId,
          metadata: { role: roleName } as any,
        },
      });
    });

    return { message: `Role "${roleName}" removed from user` };
  }

  async listRoles() {
    return this.adminRepo.findRoles();
  }

  async listTemplates(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [templates, total] = await Promise.all([
      this.adminRepo.findTemplates(skip, limit),
      this.adminRepo.countTemplates(),
    ]);
    return { templates, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createTemplate(adminUserId: string, data: { name: string; proxmoxTemplateId: string; osType: string; minDiskGb: number; minMemoryMb: number }) {
    const template = await this.prisma.$transaction(async (tx: any) => {
      const t = await this.adminRepo.createTemplate(data as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.template.create',
          resource: 'template', resourceId: t.id,
          metadata: { name: data.name, proxmoxTemplateId: data.proxmoxTemplateId } as any,
        },
      });
      return t;
    });
    return template;
  }

  async updateTemplate(adminUserId: string, id: string, data: { name?: string; isActive?: boolean; minDiskGb?: number; minMemoryMb?: number }) {
    const template = await this.adminRepo.findTemplateById(id);
    if (!template) throw new NotFoundException('Template not found');
    const result = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateTemplate(id, data as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.template.update',
          resource: 'template', resourceId: id,
          metadata: { changes: data } as any,
        },
      });
      return r;
    });
    return result;
  }

  async deleteTemplate(adminUserId: string, id: string) {
    const template = await this.adminRepo.findTemplateById(id);
    if (!template) throw new NotFoundException('Template not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.deleteTemplate(id, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.template.delete',
          resource: 'template', resourceId: id,
        },
      });
    });
    return { success: true };
  }

  async toggleNodeMaintenance(adminUserId: string, nodeId: string, isActive: boolean) {
    const node = await this.adminRepo.findNodeById(nodeId);
    if (!node) throw new NotFoundException('Node not found');
    const result = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateNode(nodeId, { isActive } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: `admin.node.${isActive ? 'activate' : 'maintenance'}`,
          resource: 'node', resourceId: nodeId,
        },
      });
      return r;
    });
    return result;
  }

  async renameVm(adminUserId: string, vmId: string, name: string) {
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    const result = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateVm(vmId, { name } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.vm.rename',
          resource: 'vm', resourceId: vmId,
          metadata: { oldName: vm.name, newName: name } as any,
        },
      });
      return r;
    });
    return result;
  }

  async impersonateUser(adminUserId: string, targetUserId: string) {
    const targetUser = await this.adminRepo.findUserBasic(targetUserId);
    if (!targetUser) throw new NotFoundException('User not found');

    const accessToken = this.jwtService.sign(
      { sub: targetUser.id, email: targetUser.email, impersonatorId: adminUserId },
    );

    await this.prisma.$transaction(async (tx: any) => {
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.user.impersonate',
          resource: 'user', resourceId: targetUserId,
        },
      });
    });

    return { accessToken, user: { id: targetUser.id, email: targetUser.email, name: targetUser.name } };
  }

  async migrateVm(adminUserId: string, vmId: string, targetNodeId: string, online?: boolean) {
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID');

    const targetNode = await this.adminRepo.findNodeById(targetNodeId);
    if (!targetNode) throw new NotFoundException('Target node not found');

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
      return this.adminRepo.findActiveTemplates();
    }
    try {
      const proxmoxTemplates = await this.proxmoxService.getTemplates();
      const dbTemplates = await this.adminRepo.findAllTemplates();
      return { proxmox: proxmoxTemplates, db: dbTemplates };
    } catch {
      return this.adminRepo.findActiveTemplates();
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
    const settings = await this.adminRepo.findSettingsByPrefix('pricing_');
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
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) return [];
    try {
      return await this.proxmoxService.getFirewallRules(vm.nodeId, vm.proxmoxId);
    } catch {
      return [];
    }
  }

  async addVmFirewall(adminUserId: string, vmId: string, rule: Record<string, unknown>) {
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID');
    const node = await this.adminRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');

    await this.jobService.enqueueJob('add-firewall-rule', {
      vmId,
      vmid: vm.proxmoxId,
      fwNode: node.proxmoxNodeId,
      rule,
    }, {
      userId: adminUserId,
      auditLog: { action: 'admin.vm.firewall.add', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Firewall rule queued' };
  }

  async deleteVmFirewall(adminUserId: string, vmId: string, pos: number) {
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (!vm.proxmoxId || !vm.nodeId) throw new BadRequestException('VM has no Proxmox ID');
    const node = await this.adminRepo.findNodeById(vm.nodeId);
    if (!node) throw new NotFoundException('Node not found');

    await this.jobService.enqueueJob('delete-firewall-rule', {
      vmId,
      vmid: vm.proxmoxId,
      fwNode: node.proxmoxNodeId,
      pos,
    }, {
      userId: adminUserId,
      auditLog: { action: 'admin.vm.firewall.delete', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Firewall rule delete queued' };
  }

  async adminReinstallVm(adminUserId: string, vmId: string, templateId: string) {
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    const template = await this.adminRepo.findTemplateById(templateId);
    if (!template) throw new BadRequestException('Template not found');

    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.updateVm(vmId, { status: 'provisioning' } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.vm.reinstall.status', resource: 'vm', resourceId: vmId },
      });
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
    const vm = await this.adminRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');

    const newCores = dto.cpuCores ?? vm.cpuCores;
    const newMemory = dto.memoryMb ?? vm.memoryMb;
    const newDisk = dto.diskGb ?? vm.diskGb;

    const allocation = await this.adminRepo.findResourceAllocationByVm(vmId);
    if (allocation) {
      const deltaCores = newCores - vm.cpuCores;
      const deltaMemory = newMemory - vm.memoryMb;
      const deltaDisk = newDisk - vm.diskGb;

      if (deltaCores > 0 || deltaMemory > 0 || deltaDisk > 0) {
        const pool = await this.adminRepo.findPoolById(allocation.poolId);
        if (pool) {
          const allAllocations = await this.adminRepo.findResourceAllocationsByPool(allocation.poolId, vmId);
          const usedCores = allAllocations.reduce((s: number, a: any) => s + a.cores, 0);
          const usedMemory = allAllocations.reduce((s: number, a: any) => s + a.memoryMb, 0);
          const usedDisk = allAllocations.reduce((s: number, a: any) => s + a.diskGb, 0);

          if (usedCores + deltaCores > pool.totalCores) throw new ForbiddenException('Insufficient CPU in pool');
          if (usedMemory + deltaMemory > pool.totalMemoryMb) throw new ForbiddenException('Insufficient memory in pool');
          if (usedDisk + deltaDisk > pool.totalDiskGb) throw new ForbiddenException('Insufficient disk in pool');
        }
      }
    }

    await this.jobService.enqueueJob('resize-vm', {
      vmId,
      proxmoxId: vm.proxmoxId,
      cores: newCores,
      memory: newMemory,
      disk: newDisk,
      node: vm.nodeId,
    }, {
      userId: adminUserId,
      auditLog: { action: 'admin.vm.resize', resource: 'vm', resourceId: vmId },
    });

    return { message: 'Resize queued' };
  }

  // --- Roles CRUD ---

  async createRole(adminUserId: string, data: { name: string; description?: string }) {
    const existing = await this.adminRepo.findRoleByName(data.name);
    if (existing) throw new BadRequestException('Role already exists');
    const role = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.createRole({ name: data.name, description: data.description } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.role.create', resource: 'role', resourceId: r.id, metadata: data as any },
      });
      return r;
    });
    return role;
  }

  async updateRole(adminUserId: string, roleId: string, data: { name?: string; description?: string }) {
    const role = await this.adminRepo.findRoleById(roleId);
    if (!role) throw new NotFoundException('Role not found');
    if (data.name && data.name !== role.name) {
      const existing = await this.adminRepo.findRoleByName(data.name);
      if (existing) throw new BadRequestException('Role name already taken');
    }
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const r = await this.adminRepo.updateRole(roleId, data as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.role.update', resource: 'role', resourceId: roleId, metadata: data as any },
      });
      return r;
    });
    return updated;
  }

  async deleteRole(adminUserId: string, roleId: string) {
    const role = await this.adminRepo.findRoleById(roleId);
    if (!role) throw new NotFoundException('Role not found');
    if (role.name === 'admin') throw new BadRequestException('Cannot delete the admin role');
    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.deleteRole(roleId, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.role.delete', resource: 'role', resourceId: roleId },
      });
    });
    return { message: 'Role deleted' };
  }

  async getRole(roleId: string) {
    const role = await this.adminRepo.findRoleWithPermissions(roleId);
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async listPermissions() {
    return this.adminRepo.findPermissions();
  }

  async addRolePermission(adminUserId: string, roleId: string, permissionId: string) {
    const role = await this.adminRepo.findRoleById(roleId);
    if (!role) throw new NotFoundException('Role not found');
    const perm = await this.adminRepo.findPermissionById(permissionId);
    if (!perm) throw new NotFoundException('Permission not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.upsertRolePermission(roleId, permissionId, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.role.add-permission', resource: 'role', resourceId: roleId, metadata: { permissionId } as any },
      });
    });
    return { message: 'Permission added to role' };
  }

  async removeRolePermission(adminUserId: string, roleId: string, permissionId: string) {
    const rp = await this.adminRepo.findRolePermission(roleId, permissionId);
    if (!rp) throw new NotFoundException('Permission not assigned to role');
    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.deleteRolePermission(rp.id, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.role.remove-permission', resource: 'role', resourceId: roleId, metadata: { permissionId } as any },
      });
    });
    return { message: 'Permission removed from role' };
  }

  // --- Support Tickets (admin) ---

  async adminListTickets(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    return this.adminRepo.findTickets(where);
  }

  async adminGetTicket(ticketId: string) {
    const ticket = await this.adminRepo.findTicketWithMessages(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async adminReplyTicket(adminUserId: string, ticketId: string, body: string) {
    const ticket = await this.adminRepo.findTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'closed') throw new BadRequestException('Ticket is closed');
    const msg = await this.prisma.$transaction(async (tx: any) => {
      const m = await this.adminRepo.createTicketMessage({ ticketId, userId: adminUserId, body } as Record<string, unknown>, tx);
      await this.adminRepo.updateTicket(ticketId, { status: 'open', updatedAt: new Date() } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.ticket.reply', resource: 'support-ticket', resourceId: ticketId },
      });
      return m;
    });
    return msg;
  }

  async adminCloseTicket(adminUserId: string, ticketId: string) {
    const ticket = await this.adminRepo.findTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'closed') throw new BadRequestException('Ticket is already closed');
    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.updateTicket(ticketId, { status: 'closed', updatedAt: new Date() } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.ticket.close', resource: 'support-ticket', resourceId: ticketId },
      });
    });
    return { message: 'Ticket closed' };
  }

  async adminReopenTicket(adminUserId: string, ticketId: string) {
    const ticket = await this.adminRepo.findTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== 'closed') throw new BadRequestException('Ticket is not closed');
    await this.prisma.$transaction(async (tx: any) => {
      await this.adminRepo.updateTicket(ticketId, { status: 'open', updatedAt: new Date() } as Record<string, unknown>, tx);
      await tx.auditLog.create({
        data: { userId: adminUserId, action: 'admin.ticket.reopen', resource: 'support-ticket', resourceId: ticketId },
      });
    });
    return { message: 'Ticket reopened' };
  }

  async broadcastNotification(adminUserId: string, title: string, body: string, targetUserId?: string) {
    await this.prisma.$transaction(async (tx: any) => {
      if (targetUserId) {
        await this.adminRepo.createNotification({ userId: targetUserId, title, body } as Record<string, unknown>, tx);
      } else {
        const users = await this.adminRepo.findManyUserIds(tx);
        await this.adminRepo.createManyNotifications(
          users.map((u: { id: string }) => ({ userId: u.id, title, body })) as Array<Record<string, unknown>>,
          tx,
        );
      }
      await tx.auditLog.create({
        data: {
          userId: adminUserId, action: 'admin.notification.broadcast',
          resource: 'notification', metadata: { title, targetUserId: targetUserId ?? 'all' } as any,
        },
      });
    });
    return { message: `Notification sent to ${targetUserId ? 'user' : 'all users'}` };
  }
}
