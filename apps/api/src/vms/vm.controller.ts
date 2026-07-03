import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VmService } from './vm.service';
import { CreateVmDto, VmActionDto, ResizeVmDto, ReinstallVmDto } from './dto/vm.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Virtual Machines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vms')
export class VmController {
  constructor(private readonly vmService: VmService) {}

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

  @Get(':id/console')
  @ApiOperation({ summary: 'Get VNC console URL' })
  async console(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.getVncUrl(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Delete a VM' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vmService.deleteVm(userId, id);
  }
}
