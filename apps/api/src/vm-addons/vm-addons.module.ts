import { Module } from '@nestjs/common';
import { VmAddonsService } from './vm-addons.service';
import { VmAddonsController } from './vm-addons.controller';
import { VmAddonsRepository } from './vm-addons.repository';
import { WalletModule } from '../wallet/wallet.module';
import { VmModule } from '../vms/vm.module';

@Module({
  imports: [WalletModule, VmModule],
  controllers: [VmAddonsController],
  providers: [VmAddonsService, VmAddonsRepository],
  exports: [VmAddonsService],
})
export class VmAddonsModule {}
