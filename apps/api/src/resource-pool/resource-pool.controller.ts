import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ResourcePoolService } from './resource-pool.service';
import { CreatePoolDto, UpdatePoolDto, AllocateResourcesDto } from './dto/create-pool.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Resource Pools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('resource-pools')
export class ResourcePoolController {
  constructor(private readonly poolService: ResourcePoolService) {}

  @Post()
  @ApiOperation({ summary: 'Create a resource pool for a customer' })
  async create(@Body() dto: CreatePoolDto) {
    return this.poolService.createPool(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pool details with allocations' })
  async get(@Param('id') id: string) {
    return this.poolService.getPool(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all pools for a user' })
  async getUserPools(@Param('userId') userId: string) {
    return this.poolService.getUserPools(userId);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Get current resource usage of a pool' })
  async getUsage(@Param('id') id: string) {
    return this.poolService.getPoolUsage(id);
  }

  @Get(':id/available')
  @ApiOperation({ summary: 'Get available resources in a pool' })
  async getAvailable(@Param('id') id: string) {
    return this.poolService.getPoolAvailable(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update pool resource limits' })
  async update(@Param('id') id: string, @Body() dto: UpdatePoolDto) {
    return this.poolService.updatePool(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an empty pool' })
  async delete(@Param('id') id: string) {
    await this.poolService.deletePool(id);
  }

  @Post('allocate')
  @ApiOperation({ summary: 'Allocate resources (admission-controlled)' })
  async allocate(@Body() dto: AllocateResourcesDto) {
    return this.poolService.allocateResources(dto);
  }

  @Post('release/:vmId')
  @ApiOperation({ summary: 'Release resources for a VM' })
  async release(@Param('vmId') vmId: string) {
    return this.poolService.releaseResources(vmId);
  }
}
