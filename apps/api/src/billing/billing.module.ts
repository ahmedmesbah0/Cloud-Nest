import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingRepository } from './billing.repository';
import { BillingJobConsumer } from './billing-job.consumer';
import { ReportJobConsumer } from './report-job.consumer';
import { BillingController } from './billing.controller';
import { WalletModule } from '../wallet/wallet.module';
import { ProxmoxModule } from '../proxmox/proxmox.module';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';
import { AuthModule } from '../auth/auth.module';
import { VmModule } from '../vms/vm.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminModule } from '../admin/admin.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    AdminModule,
    WalletModule,
    ProxmoxModule,
    ResourcePoolModule,
    AuthModule,
    VmModule,
    SubscriptionsModule,
    MailModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, BillingJobConsumer, ReportJobConsumer],
  exports: [BillingService],
})
export class BillingModule {}
