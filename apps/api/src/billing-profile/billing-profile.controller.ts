import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingProfileService } from './billing-profile.service';
import { UpsertBillingProfileDto } from './dto/billing-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Billing Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing/profile')
export class BillingProfileController {
  constructor(private readonly profileService: BillingProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get billing profile' })
  async get(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Upsert billing profile' })
  async upsert(@CurrentUser('id') userId: string, @Body() dto: UpsertBillingProfileDto) {
    return this.profileService.upsertProfile(userId, dto);
  }
}
