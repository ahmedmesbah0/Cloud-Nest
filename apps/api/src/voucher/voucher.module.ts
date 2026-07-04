import { Module } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { VoucherController } from './voucher.controller';
import { VoucherRepository } from './voucher.repository';

@Module({
  controllers: [VoucherController],
  providers: [VoucherService, VoucherRepository],
  exports: [VoucherService],
})
export class VoucherModule {}
