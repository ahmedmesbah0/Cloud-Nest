import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProxmoxModule } from './proxmox/proxmox.module';
import { BullmqModule } from './bullmq/bullmq.module';
import { ResourcePoolModule } from './resource-pool/resource-pool.module';
import { VmModule } from './vms/vm.module';
import { WalletModule } from './wallet/wallet.module';
import { VoucherModule } from './voucher/voucher.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { SupportModule } from './support/support.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { SshKeysModule } from './ssh-keys/ssh-keys.module';
import { IpPoolModule } from './ip-pool/ip-pool.module';
import { MetricsModule } from './metrics/metrics.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { BillingProfileModule } from './billing-profile/billing-profile.module';
import { ResourcePackagesModule } from './resource-packages/resource-packages.module';
import { ReferralsModule } from './referrals/referrals.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{
          ttl: seconds(config.get<number>('THROTTLE_TTL', 60)),
          limit: config.get<number>('THROTTLE_LIMIT', 60),
        }],
      }),
    }),
    ConfigModule, PrismaModule, AuthModule, ProxmoxModule, BullmqModule, ResourcePoolModule, VmModule, WalletModule, VoucherModule, BillingModule, AdminModule, SupportModule, NotificationsModule, ApiKeysModule, SshKeysModule, IpPoolModule, MetricsModule, PlansModule, SubscriptionsModule, BillingProfileModule, ResourcePackagesModule, ReferralsModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
