import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { VoucherService } from './voucher.service';
import { CreateVoucherDto, RedeemVoucherDto } from './dto/voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a voucher (admin)' })
  async create(@Body() dto: CreateVoucherDto) {
    return this.voucherService.createVoucher({
      rewardType: dto.rewardType,
      amount: dto.amount,
      planId: dto.planId,
      freePeriodDays: dto.freePeriodDays,
      discountPercent: dto.discountPercent,
      discountCredits: dto.discountCredits,
      couponScope: dto.couponScope,
      maxRedemptions: dto.maxRedemptions,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      code: dto.code,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all vouchers' })
  async list() {
    return this.voucherService.listVouchers();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Voucher statistics' })
  async stats() {
    return this.voucherService.getVoucherStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get voucher details' })
  async get(@Param('id') id: string) {
    return this.voucherService.getVoucher(id);
  }

  @Post('redeem')
  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @ApiOperation({ summary: 'Redeem a voucher' })
  async redeem(@CurrentUser('id') userId: string, @Body() dto: RedeemVoucherDto) {
    return this.voucherService.redeemVoucher(userId, dto.code);
  }

  @Post(':id/deactivate')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Deactivate a voucher (admin)' })
  async deactivate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.voucherService.deactivateVoucher(id, userId);
  }
}
