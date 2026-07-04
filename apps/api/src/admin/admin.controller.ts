import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  PaginationQueryDto, UpdateUserDto, CreditWalletDto,
  CreateNodeDto, UpdateNodeDto, SetSettingDto,
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
}
