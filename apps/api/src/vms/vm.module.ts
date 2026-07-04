import { Module } from '@nestjs/common';
import { VmService } from './vm.service';
import { VmController } from './vm.controller';
import { VmGateway } from './vm.gateway';
import { JwtService } from '@nestjs/jwt';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';

@Module({
  imports: [ResourcePoolModule],
  controllers: [VmController],
  providers: [VmService, VmGateway, JwtService],
  exports: [VmService],
})
export class VmModule {}
