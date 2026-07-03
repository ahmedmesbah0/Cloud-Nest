import { Module } from '@nestjs/common';
import { ResourcePoolService } from './resource-pool.service';
import { ResourcePoolController } from './resource-pool.controller';

@Module({
  controllers: [ResourcePoolController],
  providers: [ResourcePoolService],
  exports: [ResourcePoolService],
})
export class ResourcePoolModule {}
