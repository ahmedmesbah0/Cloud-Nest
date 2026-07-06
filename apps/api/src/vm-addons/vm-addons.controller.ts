import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VmAddonsService } from './vm-addons.service';
import { PurchaseAddOnDto } from './dto/vm-addon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('VM Add-Ons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vms/:vmId/addons')
export class VmAddonsController {
  constructor(private readonly service: VmAddonsService) {}

  @Get()
  @ApiOperation({ summary: 'List all add-ons for a VM' })
  async list(@Req() req: any, @Param('vmId') vmId: string) {
    return this.service.getAddOns(vmId, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Purchase an add-on for a VM' })
  async purchase(@Req() req: any, @Param('vmId') vmId: string, @Body() dto: PurchaseAddOnDto) {
    return this.service.purchaseAddOn(vmId, req.user.id, dto);
  }
}
