import { Module, Global, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ProxmoxJobService } from './proxmox-job.service';
import { IdempotencyKeyRepository } from './idempotency-key.repository';
import { ProxmoxJobConsumer } from './proxmox-job.consumer';
import { AuthModule } from '../auth/auth.module';
import { VmModule } from '../vms/vm.module';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportJobConsumer } from '../billing/report-job.consumer';
import { MetricsJobConsumer } from '../metrics/metrics-job.consumer';

@Global()
@Module({
  imports: [
    AuthModule,
    forwardRef(() => VmModule),
    ResourcePoolModule,
    MailModule,
    MetricsModule,
    NotificationsModule,
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'proxmox-jobs',
    }),
    BullModule.registerQueue({
      name: 'billing-jobs',
    }),
    BullModule.registerQueue({
      name: 'metrics-jobs',
    }),
    BullModule.registerQueue({
      name: 'report-jobs',
    }),
  ],
  providers: [ProxmoxJobService, IdempotencyKeyRepository, ProxmoxJobConsumer, ReportJobConsumer, MetricsJobConsumer],
  exports: [BullModule, ProxmoxJobService],
})
export class BullmqModule {}
