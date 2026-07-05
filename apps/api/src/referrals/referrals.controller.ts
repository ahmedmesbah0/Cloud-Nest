import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { CreateReferralCodeDto, RedeemReferralCodeDto } from './dto/referral.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@ApiTags('Referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate my referral code' })
  async generate(@Req() req: any, @Body() dto: CreateReferralCodeDto) {
    return this.service.generateCode(
      req.user.id,
      dto.code,
      dto.maxUses,
      dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    );
  }

  @Get('my-code')
  @ApiOperation({ summary: 'Get my referral code and stats' })
  async myCode(@Req() req: any) {
    return this.service.getMyCode(req.user.id);
  }

  @Get('my-stats')
  @ApiOperation({ summary: 'Get my referral stats' })
  async myStats(@Req() req: any) {
    return this.service.getUserReferralStats(req.user.id);
  }

  @Post('redeem')
  @ApiOperation({ summary: 'Redeem a referral code' })
  async redeem(@Req() req: any, @Body() dto: RedeemReferralCodeDto) {
    return this.service.redeemReferral(req.user.id, dto.code);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all referral codes (admin)' })
  async listAll() {
    return this.service.getAllCodes();
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get referral stats (admin)' })
  async stats() {
    return this.service.getAllReferralStats();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Lookup a referral code' })
  async lookup(@Param('code') code: string) {
    return this.service.getCodeByString(code);
  }
}
