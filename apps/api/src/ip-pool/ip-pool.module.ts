import { Module } from '@nestjs/common';
import { IpPoolController } from './ip-pool.controller';
import { IpPoolService } from './ip-pool.service';
import { IpPoolRepository } from './ip-pool.repository';

@Module({
  controllers: [IpPoolController],
  providers: [IpPoolService, IpPoolRepository],
  exports: [IpPoolService],
})
export class IpPoolModule {}
