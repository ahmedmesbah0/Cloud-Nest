import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansRepository } from './plans.repository';
import { PlansController } from './plans.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [PlansController],
  providers: [PlansService, PlansRepository],
  exports: [PlansService],
})
export class PlansModule {}
