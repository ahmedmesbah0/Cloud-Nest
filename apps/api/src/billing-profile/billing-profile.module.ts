import { Module } from '@nestjs/common';
import { BillingProfileService } from './billing-profile.service';
import { BillingProfileRepository } from './billing-profile.repository';
import { BillingProfileController } from './billing-profile.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BillingProfileController],
  providers: [BillingProfileService, BillingProfileRepository],
  exports: [BillingProfileService],
})
export class BillingProfileModule {}
