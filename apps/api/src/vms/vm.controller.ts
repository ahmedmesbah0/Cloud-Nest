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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VmService } from './vm.service';
import { CreateVmDto, VmActionDto, ResizeVmDto, ReinstallVmDto, MountIsoDto, CreateBackupDto, CreateSnapshotDto, QemuHardwareDto, SetNetworkDto, SetDnsDto } from './dto/vm.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Virtual Machines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vms')
export class VmController {
  constructor(private readonly vmService: VmService) {}

  @Get('templates')
  @ApiOperation({ summary: 'List available VM templates' })
  async listTemplates() {
    return this.vmService.listTemplates();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new VM' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateVmDto) {
    return this.vmService.createVm(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all VMs for current user' })
  async list(@CurrentUser('id') userId: string) {
    return this.vmService.listVms(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get VM details' })
  async get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getVm(id, userId);
  }

  @Post(':id/action')
  @ApiOperation({ summary: 'Start/stop/restart/shutdown a VM' })
  async action(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: VmActionDto,
  ) {
    return this.vmService.performAction(userId, id, dto.action);
  }

  @Post(':id/resize')
  @ApiOperation({ summary: 'Resize VM resources' })
  async resize(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ResizeVmDto,
  ) {
    return this.vmService.resizeVm(userId, id, dto);
  }

  @Post(':id/reinstall')
  @ApiOperation({ summary: 'Reinstall OS on VM' })
  async reinstall(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReinstallVmDto,
  ) {
    return this.vmService.reinstallVm(userId, id, dto.templateId);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get VM resource usage metrics (CPU, RAM, disk, network)' })
  async metrics(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('timeframe') timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year',
  ) {
    return this.vmService.getMetrics(userId, id, timeframe);
  }

  @Get(':id/console')
  @ApiOperation({ summary: 'Get VNC console details' })
  async console(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getVncUrl(userId, id);
  }

  @Post(':id/mount-iso')
  @ApiOperation({ summary: 'Mount an ISO image' })
  async mountIso(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: MountIsoDto,
  ) {
    return this.vmService.mountIso(userId, id, dto.iso, dto.storage);
  }

  @Post(':id/eject-iso')
  @ApiOperation({ summary: 'Eject the mounted ISO' })
  async ejectIso(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.ejectIso(userId, id);
  }

  // --- ISO Management ---

  @Get(':id/iso/storages')
  @ApiOperation({ summary: 'List storage pools available for ISO content' })
  async getIsoStorages(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getIsoStorages(userId, id);
  }

  @Get(':id/iso/list')
  @ApiOperation({ summary: 'List ISO files in a storage' })
  async getIsoList(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('storage') storage: string,
  ) {
    return this.vmService.getIsoList(userId, id, storage);
  }

  @Get(':id/iso/current')
  @ApiOperation({ summary: 'Get currently mounted ISO' })
  async getCurrentIso(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getCurrentIso(userId, id);
  }

  @Post(':id/iso/download-url')
  @ApiOperation({ summary: 'Download ISO from a URL into storage' })
  async downloadUrlIso(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { url: string; storage: string },
  ) {
    return this.vmService.downloadUrlIso(userId, id, body.url, body.storage);
  }

  @Post(':id/migrate')
  @ApiOperation({ summary: 'Migrate VM to another node' })
  async migrate(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: { targetNodeId: string; online?: boolean },
  ) {
    return this.vmService.migrateVm(userId, id, dto.targetNodeId, dto.online);
  }

  // --- Backups ---

  @Get(':id/backups')
  @ApiOperation({ summary: 'List backups for a VM' })
  async listBackups(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.listBackups(userId, id);
  }

  @Post(':id/backups')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create a backup' })
  async createBackup(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateBackupDto,
  ) {
    return this.vmService.createBackup(userId, id, dto);
  }

  @Delete(':id/backups/:backupId')
  @ApiOperation({ summary: 'Delete a backup' })
  async deleteBackup(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('backupId') backupId: string,
  ) {
    return this.vmService.deleteBackup(userId, id, backupId);
  }

  @Post(':id/backups/:backupId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore VM from a backup' })
  async restoreBackup(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('backupId') backupId: string,
  ) {
    return this.vmService.restoreBackup(userId, id, backupId);
  }

  // --- Snapshots ---

  @Get(':id/snapshots')
  @ApiOperation({ summary: 'List snapshots for a VM' })
  async listSnapshots(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.listSnapshots(userId, id);
  }

  @Post(':id/snapshots')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a snapshot' })
  async createSnapshot(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateSnapshotDto,
  ) {
    return this.vmService.createSnapshot(userId, id, dto.name, dto.description);
  }

  @Delete(':id/snapshots/:snapshotId')
  @ApiOperation({ summary: 'Delete a snapshot' })
  async deleteSnapshot(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.vmService.deleteSnapshot(userId, id, snapshotId);
  }

  @Post(':id/snapshots/:snapshotId/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rollback VM to a snapshot' })
  async rollbackSnapshot(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.vmService.rollbackSnapshot(userId, id, snapshotId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Delete a VM' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.deleteVm(userId, id);
  }

  // --- QEMU Hardware Config ---

  @Get(':id/hardware')
  @ApiOperation({ summary: 'Get QEMU hardware configuration (BIOS, boot, CPU type, etc.)' })
  async getHardware(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getHardwareConfig(userId, id);
  }

  @Put(':id/hardware')
  @ApiOperation({ summary: 'Update QEMU hardware configuration' })
  async updateHardware(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: QemuHardwareDto,
  ) {
    const config: Record<string, unknown> = {};
    for (const key of Object.keys(dto)) {
      if ((dto as any)[key] !== undefined) config[key] = (dto as any)[key];
    }
    return this.vmService.updateHardwareConfig(userId, id, config);
  }

  // --- Network Interfaces ---

  @Get(':id/network')
  @ApiOperation({ summary: 'List network interfaces (net0..netN)' })
  async getNetwork(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getNetworkInterfaces(userId, id);
  }

  @Post(':id/network')
  @ApiOperation({ summary: 'Add or update a network interface' })
  async setNetwork(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SetNetworkDto,
  ) {
    return this.vmService.setNetworkInterface(userId, id, dto.key, dto.value);
  }

  @Delete(':id/network/:key')
  @ApiOperation({ summary: 'Delete a network interface' })
  async deleteNetwork(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('key') key: string,
  ) {
    return this.vmService.deleteNetworkInterface(userId, id, key);
  }

  // --- DNS ---

  @Get(':id/dns')
  @ApiOperation({ summary: 'Get DNS settings' })
  async getDns(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getDnsConfig(userId, id);
  }

  @Put(':id/dns')
  @ApiOperation({ summary: 'Update DNS settings' })
  async setDns(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SetDnsDto,
  ) {
    return this.vmService.setDnsConfig(userId, id, dto);
  }

  // --- Firewall ---

  @Get(':id/firewall')
  @ApiOperation({ summary: 'List firewall rules' })
  async getFirewallRules(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getFirewallRules(userId, id);
  }

  @Post(':id/firewall')
  @ApiOperation({ summary: 'Add a firewall rule' })
  async addFirewallRule(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() body: any) {
    return this.vmService.addFirewallRule(userId, id, body);
  }

  @Delete(':id/firewall/:pos')
  @ApiOperation({ summary: 'Delete a firewall rule' })
  async deleteFirewallRule(@CurrentUser('id') userId: string, @Param('id') id: string, @Param('pos') pos: number) {
    return this.vmService.deleteFirewallRule(userId, id, pos);
  }

  // --- Activity Log ---

  @Get(':id/activities')
  @ApiOperation({ summary: 'Get activity log for a VM' })
  async getActivities(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.vmService.getActivities(userId, id, page ?? 1, limit ?? 50);
  }
}
