import { Module, Global, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ProxmoxJobService } from './proxmox-job.service';
import { IdempotencyKeyRepository } from './idempotency-key.repository';
import { ProxmoxJobConsumer } from './proxmox-job.consumer';
import { VmModule } from '../vms/vm.module';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';

@Global()
@Module({
  imports: [
    forwardRef(() => VmModule),
    ResourcePoolModule,
    NotificationsModule,
    WalletModule,
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
  providers: [ProxmoxJobService, IdempotencyKeyRepository, ProxmoxJobConsumer],
  exports: [BullModule, ProxmoxJobService, IdempotencyKeyRepository],
})
export class BullmqModule {}
