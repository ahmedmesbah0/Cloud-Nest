import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VmSubusersService } from './vm-subusers.service';
import { AddSubuserDto, UpdateSubuserPermissionsDto } from './dto/vm-subuser.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('VM Subusers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vms/:vmId/subusers')
export class VmSubusersController {
  constructor(private readonly service: VmSubusersService) {}

  @Get()
  @ApiOperation({ summary: 'List subusers of a VM' })
  list(@CurrentUser('id') userId: string, @Param('vmId') vmId: string) {
    return this.service.list(userId, vmId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a subuser to a VM' })
  add(@CurrentUser('id') userId: string, @Param('vmId') vmId: string, @Body() dto: AddSubuserDto) {
    return this.service.add(userId, vmId, dto);
  }

  @Patch(':subuserId')
  @ApiOperation({ summary: 'Update subuser permissions' })
  updatePermissions(
    @CurrentUser('id') userId: string,
    @Param('vmId') vmId: string,
    @Param('subuserId') subuserId: string,
    @Body() dto: UpdateSubuserPermissionsDto,
  ) {
    return this.service.updatePermissions(userId, vmId, subuserId, dto);
  }

  @Delete(':subuserId')
  @ApiOperation({ summary: 'Remove a subuser from a VM' })
  remove(@CurrentUser('id') userId: string, @Param('vmId') vmId: string, @Param('subuserId') subuserId: string) {
    return this.service.remove(userId, vmId, subuserId);
  }
}
