import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IpPoolService } from './ip-pool.service';
import { CreateIpPoolDto, UpdateIpPoolDto, AddIpBlockDto } from './dto/ip-pool.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@ApiTags('IP Pools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('ip-pools')
export class IpPoolController {
  constructor(private readonly service: IpPoolService) {}

  @Get()
  @ApiOperation({ summary: 'List all IP pools' })
  async list() {
    return this.service.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pool details with IPs' })
  async get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an IP pool' })
  async create(@Body() dto: CreateIpPoolDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an IP pool' })
  async update(@Param('id') id: string, @Body() dto: UpdateIpPoolDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an empty IP pool' })
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
  }

  @Post('ips')
  @ApiOperation({ summary: 'Add an IP address to a pool' })
  async addIp(@Body() dto: AddIpBlockDto) {
    return this.service.addIp(dto.poolId, dto.address);
  }

  @Delete('ips/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an IP address from a pool' })
  async removeIp(@Param('id') id: string) {
    await this.service.removeIp(id);
  }

  @Put('ips/:id/ptr')
  @ApiOperation({ summary: 'Set PTR record for an IP' })
  async setPtrRecord(@Param('id') id: string, @Body() dto: { ptrRecord: string }) {
    return this.service.setPtrRecord(id, dto.ptrRecord);
  }

  @Get(':id/available-ip')
  @ApiOperation({ summary: 'Get next available IP in pool' })
  async getAvailableIp(@Param('id') id: string) {
    return this.service.getAvailableIp(id);
  }
}
