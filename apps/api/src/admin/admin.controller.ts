import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  PaginationQueryDto, UpdateUserDto, CreditWalletDto,
  CreateNodeDto, UpdateNodeDto, SetSettingDto,
  CreateRoleDto, UpdateRoleDto, AddPermissionDto, AdminReplyTicketDto,
} from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard statistics' })
  async dashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  async listUsers(@Query() query: PaginationQueryDto) {
    return this.adminService.listUsers(query.page ?? 1, query.limit ?? 50);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details' })
  async getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Update user profile' })
  async updateUser(
    @CurrentUser('id') adminUserId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(adminUserId, id, dto);
  }

  @Post('users/:id/impersonate')
  @ApiOperation({ summary: 'Generate impersonation token (admin)' })
  async impersonate(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.impersonateUser(adminUserId, id);
  }

  @Post('users/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate user' })
  async deactivateUser(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.deactivateUser(adminUserId, id);
  }

  @Post('users/:id/activate')
  @ApiOperation({ summary: 'Activate user' })
  async activateUser(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.activateUser(adminUserId, id);
  }

  @Post('users/:id/credit')
  @ApiOperation({ summary: 'Manually credit user wallet' })
  async creditWallet(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() dto: CreditWalletDto) {
    return this.adminService.creditUserWallet(adminUserId, id, dto.amount);
  }

  @Post('users/:id/roles/:role')
  @ApiOperation({ summary: 'Assign a role to user' })
  async assignRole(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Param('role') role: string) {
    return this.adminService.assignRole(adminUserId, id, role);
  }

  @Delete('users/:id/roles/:role')
  @ApiOperation({ summary: 'Remove a role from user' })
  async removeRole(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Param('role') role: string) {
    return this.adminService.removeRole(adminUserId, id, role);
  }

  @Get('vms')
  @ApiOperation({ summary: 'List all VMs' })
  async listVms(@Query() query: PaginationQueryDto) {
    return this.adminService.listAllVms(query.page ?? 1, query.limit ?? 50);
  }

  @Get('vms/:id')
  @ApiOperation({ summary: 'Get VM details (admin)' })
  async getVm(@Param('id') id: string) {
    return this.adminService.getAdminVm(id);
  }

  @Post('vms/:id/action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Power action on VM (start/stop/restart/shutdown)' })
  async vmPowerAction(
    @CurrentUser('id') adminUserId: string,
    @Param('id') id: string,
    @Body('action') action: 'start' | 'stop' | 'restart' | 'shutdown',
  ) {
    return this.adminService.adminPowerAction(adminUserId, id, action);
  }

  @Post('vms/:id/force-stop')
  @ApiOperation({ summary: 'Force stop a VM' })
  async forceStopVm(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.forceStopVm(adminUserId, id);
  }

  @Delete('vms/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Force delete a VM' })
  async forceDeleteVm(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.forceDeleteVm(adminUserId, id);
  }

  @Post('vms/:id/migrate')
  @ApiOperation({ summary: 'Migrate VM to another node (admin)' })
  async migrateVm(
    @CurrentUser('id') adminUserId: string,
    @Param('id') id: string,
    @Body() dto: { targetNodeId: string; online?: boolean },
  ) {
    return this.adminService.migrateVm(adminUserId, id, dto.targetNodeId, dto.online);
  }

  @Get('nodes')
  @ApiOperation({ summary: 'List all nodes with inventory' })
  async listNodes() {
    return this.adminService.listNodes();
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get node details' })
  async getNode(@Param('id') id: string) {
    return this.adminService.getNode(id);
  }

  @Post('nodes')
  @ApiOperation({ summary: 'Create a new node' })
  async createNode(@CurrentUser('id') adminUserId: string, @Body() dto: CreateNodeDto) {
    return this.adminService.createNode(adminUserId, dto);
  }

  @Put('nodes/:id')
  @ApiOperation({ summary: 'Update node configuration' })
  async updateNode(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.adminService.updateNode(adminUserId, id, dto);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get all system settings' })
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Get('settings/:key')
  @ApiOperation({ summary: 'Get a specific setting' })
  async getSetting(@Param('key') key: string) {
    return this.adminService.getSetting(key);
  }

  @Put('settings/:key')
  @ApiOperation({ summary: 'Set a system setting' })
  async setSetting(@Param('key') key: string, @Body() dto: SetSettingDto) {
    return this.adminService.setSetting(key, dto.value);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Set multiple settings at once' })
  async setSettings(@Body() data: Record<string, string>) {
    const results: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      results[key] = await this.adminService.setSetting(key, value);
    }
    return results;
  }

  @Delete('settings/:key')
  @ApiOperation({ summary: 'Delete a system setting' })
  async deleteSetting(@Param('key') key: string) {
    return this.adminService.deleteSetting(key);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'View audit logs' })
  async getAuditLogs(@Query() query: PaginationQueryDto) {
    return this.adminService.getAuditLogs(query.page ?? 1, query.limit ?? 100);
  }

  @Get('roles')
  @ApiOperation({ summary: 'List all roles with permissions' })
  async listRoles() {
    return this.adminService.listRoles();
  }

  @Post('roles')
  @ApiOperation({ summary: 'Create a role' })
  async createRole(@CurrentUser('id') adminUserId: string, @Body() dto: CreateRoleDto) {
    return this.adminService.createRole(adminUserId, dto);
  }

  @Get('roles/:id')
  @ApiOperation({ summary: 'Get role details' })
  async getRole(@Param('id') id: string) {
    return this.adminService.getRole(id);
  }

  @Put('roles/:id')
  @ApiOperation({ summary: 'Update a role' })
  async updateRole(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateRole(adminUserId, id, dto);
  }

  @Delete('roles/:id')
  @ApiOperation({ summary: 'Delete a role' })
  async deleteRole(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.deleteRole(adminUserId, id);
  }

  @Post('roles/:id/permissions')
  @ApiOperation({ summary: 'Add permission to role' })
  async addRolePermission(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() dto: AddPermissionDto) {
    return this.adminService.addRolePermission(adminUserId, id, dto.permissionId);
  }

  @Delete('roles/:id/permissions/:permissionId')
  @ApiOperation({ summary: 'Remove permission from role' })
  async removeRolePermission(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Param('permissionId') permissionId: string) {
    return this.adminService.removeRolePermission(adminUserId, id, permissionId);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'List all available permissions' })
  async listPermissions() {
    return this.adminService.listPermissions();
  }

  @Get('support-tickets')
  @ApiOperation({ summary: 'List all support tickets (admin)' })
  async adminListTickets(@Query('status') status?: string) {
    return this.adminService.adminListTickets(status);
  }

  @Get('support-tickets/:id')
  @ApiOperation({ summary: 'Get support ticket details (admin)' })
  async adminGetTicket(@Param('id') id: string) {
    return this.adminService.adminGetTicket(id);
  }

  @Post('support-tickets/:id/reply')
  @ApiOperation({ summary: 'Reply to support ticket (admin)' })
  async adminReplyTicket(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() dto: AdminReplyTicketDto) {
    return this.adminService.adminReplyTicket(adminUserId, id, dto.message);
  }

  @Post('support-tickets/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close support ticket' })
  async adminCloseTicket(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.adminCloseTicket(adminUserId, id);
  }

  @Post('support-tickets/:id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen support ticket' })
  async adminReopenTicket(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.adminReopenTicket(adminUserId, id);
  }

  @Get('templates')
  @ApiOperation({ summary: 'List VM templates' })
  async listTemplates(@Query() query: PaginationQueryDto) {
    return this.adminService.listTemplates(query.page ?? 1, query.limit ?? 50);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a VM template' })
  async createTemplate(@CurrentUser('id') adminUserId: string, @Body() body: any) {
    return this.adminService.createTemplate(adminUserId, body);
  }

  @Put('templates/:id')
  @ApiOperation({ summary: 'Update a VM template' })
  async updateTemplate(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() body: any) {
    return this.adminService.updateTemplate(adminUserId, id, body);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete a VM template' })
  async deleteTemplate(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.adminService.deleteTemplate(adminUserId, id);
  }

  @Get('templates/proxmox')
  @ApiOperation({ summary: 'Get Proxmox templates + DB templates' })
  async getProxmoxTemplates() {
    return this.adminService.getProxmoxTemplates();
  }

  @Put('nodes/:id/maintenance')
  @ApiOperation({ summary: 'Toggle node maintenance mode' })
  async toggleNodeMaintenance(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() body: any) {
    return this.adminService.toggleNodeMaintenance(adminUserId, id, body.isActive);
  }

  @Put('vms/:id/rename')
  @ApiOperation({ summary: 'Rename a VM' })
  async renameVm(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() body: any) {
    return this.adminService.renameVm(adminUserId, id, body.name);
  }

  @Get('proxmox-storage/:node')
  @ApiOperation({ summary: 'Get Proxmox storage pools for a node' })
  async getProxmoxStorage(@Param('node') node: string) {
    return this.adminService.getProxmoxStorage(node);
  }

  @Get('billing-pricing')
  @ApiOperation({ summary: 'Get billing pricing' })
  async getBillingPricing() {
    return this.adminService.getBillingPricing();
  }

  @Put('billing-pricing')
  @ApiOperation({ summary: 'Set billing pricing' })
  async setBillingPricing(@CurrentUser('id') adminUserId: string, @Body() body: Record<string, number>) {
    return this.adminService.setBillingPricing(adminUserId, body);
  }

  @Get('vms/:id/firewall')
  @ApiOperation({ summary: 'Get VM firewall rules (admin)' })
  async getVmFirewall(@Param('id') id: string) {
    return this.adminService.getVmFirewall(id);
  }

  @Post('vms/:id/firewall')
  @ApiOperation({ summary: 'Add VM firewall rule (admin)' })
  async addVmFirewall(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() body: any) {
    return this.adminService.addVmFirewall(adminUserId, id, body);
  }

  @Delete('vms/:id/firewall/:pos')
  @ApiOperation({ summary: 'Delete VM firewall rule (admin)' })
  async deleteVmFirewall(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Param('pos') pos: number) {
    return this.adminService.deleteVmFirewall(adminUserId, id, pos);
  }

  @Post('vms/:id/reinstall')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reinstall OS on VM (admin)' })
  async adminReinstallVm(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body('templateId') templateId: string) {
    return this.adminService.adminReinstallVm(adminUserId, id, templateId);
  }
}
