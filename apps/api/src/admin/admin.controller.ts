import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Dashboard ────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard statistics' })
  async dashboard() {
    return this.adminService.getDashboardStats();
  }

  // ─── User Management ──────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listUsers(Number(page) || 1, Number(limit) || 50);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details' })
  async getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Update user profile' })
  async updateUser(
    @Param('id') id: string,
    @Body() data: { name?: string; emailVerified?: boolean; isActive?: boolean },
  ) {
    return this.adminService.updateUser(id, data);
  }

  @Post('users/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate user' })
  async deactivateUser(@Param('id') id: string) {
    return this.adminService.deactivateUser(id);
  }

  @Post('users/:id/activate')
  @ApiOperation({ summary: 'Activate user' })
  async activateUser(@Param('id') id: string) {
    return this.adminService.activateUser(id);
  }

  @Post('users/:id/credit')
  @ApiOperation({ summary: 'Manually credit user wallet' })
  async creditWallet(@Param('id') id: string, @Body() data: { amount: number }) {
    return this.adminService.creditUserWallet(id, data.amount);
  }

  @Post('users/:id/roles/:role')
  @ApiOperation({ summary: 'Assign a role to user' })
  async assignRole(@Param('id') id: string, @Param('role') role: string) {
    return this.adminService.assignRole(id, role);
  }

  @Delete('users/:id/roles/:role')
  @ApiOperation({ summary: 'Remove a role from user' })
  async removeRole(@Param('id') id: string, @Param('role') role: string) {
    return this.adminService.removeRole(id, role);
  }

  // ─── VM Oversight ─────────────────────────────────────

  @Get('vms')
  @ApiOperation({ summary: 'List all VMs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listVms(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listAllVms(Number(page) || 1, Number(limit) || 50);
  }

  @Post('vms/:id/force-stop')
  @ApiOperation({ summary: 'Force stop a VM' })
  async forceStopVm(@Param('id') id: string) {
    return this.adminService.forceStopVm(id);
  }

  @Delete('vms/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Force delete a VM' })
  async forceDeleteVm(@Param('id') id: string) {
    return this.adminService.forceDeleteVm(id);
  }

  // ─── Node Management ──────────────────────────────────

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
  async createNode(@Body() data: { proxmoxNodeId: string; name: string; host: string; port?: number }) {
    return this.adminService.createNode(data);
  }

  @Put('nodes/:id')
  @ApiOperation({ summary: 'Update node configuration' })
  async updateNode(
    @Param('id') id: string,
    @Body() data: { name?: string; host?: string; port?: number; isActive?: boolean },
  ) {
    return this.adminService.updateNode(id, data);
  }

  // ─── Settings ─────────────────────────────────────────

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
  async setSetting(@Param('key') key: string, @Body() data: { value: string }) {
    return this.adminService.setSetting(key, data.value);
  }

  @Delete('settings/:key')
  @ApiOperation({ summary: 'Delete a system setting' })
  async deleteSetting(@Param('key') key: string) {
    return this.adminService.deleteSetting(key);
  }

  // ─── Audit Logs ───────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'View audit logs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAuditLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getAuditLogs(Number(page) || 1, Number(limit) || 100);
  }

  // ─── Roles ────────────────────────────────────────────

  @Get('roles')
  @ApiOperation({ summary: 'List all roles with permissions' })
  async listRoles() {
    return this.adminService.listRoles();
  }
}
