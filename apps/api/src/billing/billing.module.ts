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

@Module({
  imports: [
    WalletModule,
    ProxmoxModule,
    ResourcePoolModule,
    AuthModule,
    VmModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, BillingJobConsumer, ReportJobConsumer],
  exports: [BillingService],
})
export class BillingModule {}
