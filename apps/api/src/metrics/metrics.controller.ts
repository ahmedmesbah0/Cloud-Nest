import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@ApiTags('Metrics')
@ApiBearerAuth()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('aggregated')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get aggregated VM/node metrics for charts' })
  async getAggregated(@Query('hours') hours?: string) {
    return this.metricsService.getAggregatedMetrics(hours ? parseInt(hours) : 24);
  }

  @Get('vm/:vmId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get VM metrics' })
  async getVmMetrics(@Param('vmId') vmId: string, @Query('hours') hours?: string) {
    return this.metricsService.getVmMetrics(vmId, hours ? parseInt(hours) : 24);
  }

  @Get('node/:nodeId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get node metrics' })
  async getNodeMetrics(@Param('nodeId') nodeId: string, @Query('hours') hours?: string) {
    return this.metricsService.getNodeMetrics(nodeId, hours ? parseInt(hours) : 24);
  }
}
