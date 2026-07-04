import { Module } from '@nestjs/common';
import { IpPoolController } from './ip-pool.controller';
import { IpPoolService } from './ip-pool.service';

@Module({
  controllers: [IpPoolController],
  providers: [IpPoolService],
  exports: [IpPoolService],
})
export class IpPoolModule {}
