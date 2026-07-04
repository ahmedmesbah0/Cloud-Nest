import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsRepository } from './metrics.repository';
import { MetricsController } from './metrics.controller';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsRepository, AdminGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
