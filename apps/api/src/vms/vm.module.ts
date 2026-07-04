import { Module } from '@nestjs/common';
import { VmService } from './vm.service';
import { VmController } from './vm.controller';
import { VmGateway } from './vm.gateway';
import { VncProxyGateway } from './vnc-proxy.gateway';
import { JwtService } from '@nestjs/jwt';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';

@Module({
  imports: [ResourcePoolModule],
  controllers: [VmController],
  providers: [VmService, VmGateway, VncProxyGateway, JwtService],
  exports: [VmService, VmGateway],
})
export class VmModule {}
