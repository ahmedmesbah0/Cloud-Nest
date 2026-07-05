import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsRepository } from './metrics.repository';
import { MetricsController } from './metrics.controller';
import { MetricsJobConsumer } from './metrics-job.consumer';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsRepository, MetricsJobConsumer],
  exports: [MetricsService],
})
export class MetricsModule {}
