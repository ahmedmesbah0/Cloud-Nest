import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('estimate/:vmId')
  @ApiOperation({ summary: 'Get billing estimate for a VM' })
  async estimate(@Param('vmId') vmId: string) {
    return this.billingService.getVmBillingEstimate(vmId);
  }

  @Get('charges')
  @ApiOperation({ summary: 'Get hourly usage charges' })
  async charges(@CurrentUser('id') userId: string) {
    return this.billingService.getUsageCharges(userId);
  }

  @Post('tick')
  @ApiOperation({ summary: 'Run hourly billing tick (admin/cron)' })
  async tick() {
    return this.billingService.runHourlyBilling();
  }
}
