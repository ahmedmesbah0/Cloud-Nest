import { Module } from '@nestjs/common';
import { IpPoolController } from './ip-pool.controller';
import { IpPoolService } from './ip-pool.service';
import { IpPoolRepository } from './ip-pool.repository';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [IpPoolController],
  providers: [IpPoolService, IpPoolRepository],
  exports: [IpPoolService],
})
export class IpPoolModule {}
