import { Module } from '@nestjs/common';
import { ResourcePoolService } from './resource-pool.service';
import { ResourcePoolController } from './resource-pool.controller';
import { ResourcePoolRepository } from './resource-pool.repository';

@Module({
  controllers: [ResourcePoolController],
  providers: [ResourcePoolService, ResourcePoolRepository],
  exports: [ResourcePoolService],
})
export class ResourcePoolModule {}
