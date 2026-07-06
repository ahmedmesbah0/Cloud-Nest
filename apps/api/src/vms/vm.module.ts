import { Module } from '@nestjs/common';
import { VmService } from './vm.service';
import { VmRepository } from './vm.repository';
import { VmController } from './vm.controller';
import { VmGateway } from './vm.gateway';
import { VncProxyGateway } from './vnc-proxy.gateway';
import { JwtService } from '@nestjs/jwt';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { VmSubusersModule } from '../vm-subusers/vm-subusers.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [ResourcePoolModule, SubscriptionsModule, VmSubusersModule, WalletModule],
  controllers: [VmController],
  providers: [VmService, VmRepository, VmGateway, VncProxyGateway, JwtService],
  exports: [VmService, VmGateway],
})
export class VmModule {}
