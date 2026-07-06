import { Controller, Get, Post, Put, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { CreateReferralCodeDto, RedeemReferralCodeDto, UpdateReferralSettingsDto } from './dto/referral.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @Post('visit')
  @ApiOperation({ summary: 'Track a referral visit (no auth required)' })
  async trackVisit(@Body() body: { code: string }) {
    const exists = await this.service.getCodeByString(body.code).catch(() => null);
    if (!exists) return { valid: false };
    return { valid: true, code: body.code };
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my referral code and stats' })
  async myCode(@Req() req: any) {
    return this.service.getMyCode(req.user.id);
  }

  @Get('my-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my referral stats' })
  async myStats(@Req() req: any) {
    return this.service.getUserReferralStats(req.user.id);
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Redeem a referral code' })
  async redeem(@Req() req: any, @Body() dto: RedeemReferralCodeDto) {
    return this.service.redeemReferral(req.user.id, dto.code);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all referral codes (admin)' })
  async listAll() {
    return this.service.getAllCodes();
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral stats (admin)' })
  async stats() {
    return this.service.getAllReferralStats();
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral reward settings (admin)' })
  async getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update referral reward settings (admin)' })
  async updateSettings(@Body() dto: UpdateReferralSettingsDto) {
    return this.service.updateSettings(dto);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Lookup a referral code' })
  async lookup(@Param('code') code: string) {
    return this.service.getCodeByString(code);
  }
}
