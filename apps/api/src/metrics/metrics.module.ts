import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, AdminGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
