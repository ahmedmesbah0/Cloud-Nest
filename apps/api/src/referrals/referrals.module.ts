import { Module, forwardRef } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsRepository } from './referrals.repository';
import { ReferralsController } from './referrals.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => AdminModule), WalletModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralsRepository],
  exports: [ReferralsService],
})
export class ReferralsModule {}
