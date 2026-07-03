import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VoucherService } from './voucher.service';
import { CreateVoucherDto, RedeemVoucherDto } from './dto/voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Post()
  @ApiOperation({ summary: 'Create a voucher (admin)' })
  async create(@Body() dto: CreateVoucherDto) {
    return this.voucherService.createVoucher({
      amount: dto.amount,
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
  @ApiOperation({ summary: 'Redeem a voucher' })
  async redeem(@CurrentUser('id') userId: string, @Body() dto: RedeemVoucherDto) {
    return this.voucherService.redeemVoucher(userId, dto.code);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a voucher' })
  async deactivate(@Param('id') id: string) {
    return this.voucherService.deactivateVoucher(id);
  }
}
