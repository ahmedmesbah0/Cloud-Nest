import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ResourcePackagesService } from './resource-packages.service';
import { CreateResourcePackageDto, UpdateResourcePackageDto } from './dto/resource-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@ApiTags('Resource Packages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('resource-packages')
export class ResourcePackagesController {
  constructor(private readonly service: ResourcePackagesService) {}

  // ─── Admin CRUD ──────────────────────────────────────────────

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a resource package (admin)' })
  async create(@Body() dto: CreateResourcePackageDto) {
    return this.service.createPackage(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List active resource packages' })
  async list(@Query('all') all?: string) {
    return this.service.listPackages(all === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a resource package' })
  async get(@Param('id') id: string) {
    return this.service.getPackage(id);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a resource package (admin)' })
  async update(@Param('id') id: string, @Body() dto: UpdateResourcePackageDto) {
    return this.service.updatePackage(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a resource package (admin)' })
  async delete(@Param('id') id: string) {
    return this.service.deletePackage(id);
  }

  // ─── Customer: Purchase ──────────────────────────────────────

  @Post(':id/purchase')
  @ApiOperation({ summary: 'Purchase a resource package' })
  async purchase(@Param('id') id: string, @Req() req: any) {
    return this.service.purchasePackage(req.user.id, id);
  }

  @Get('me/purchases')
  @ApiOperation({ summary: 'Get my purchased resource packages' })
  async myPurchases(@Req() req: any) {
    return this.service.getUserPurchases(req.user.id);
  }

  @Get('me/limits')
  @ApiOperation({ summary: 'Get accumulated resource limits from purchases' })
  async myLimits(@Req() req: any) {
    return this.service.getAccumulatedLimits(req.user.id);
  }

  @Get('purchases/:id')
  @ApiOperation({ summary: 'Get a purchase record' })
  async getPurchase(@Param('id') id: string, @Req() req: any) {
    return this.service.getPurchase(id, req.user.id);
  }
}
