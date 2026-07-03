import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ProxmoxJobService } from './proxmox-job.service';
import { ProxmoxJobConsumer } from './proxmox-job.consumer';

@Global()
@Module({
  imports: [
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
  ],
  providers: [ProxmoxJobService, ProxmoxJobConsumer],
  exports: [BullModule, ProxmoxJobService],
})
export class BullmqModule {}
