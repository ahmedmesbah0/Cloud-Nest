import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { SubscribeDto, ChangePlanDto, CancelSubscriptionDto, AdminRefundDto, AdminSubscriptionQueryDto } from './dto/subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subsService: SubscriptionsService) {}

  @Post()
  @ApiOperation({ summary: 'Subscribe to a plan' })
  async subscribe(@CurrentUser('id') userId: string, @Body() dto: SubscribeDto) {
    return this.subsService.subscribe(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my subscriptions' })
  async list(@CurrentUser('id') userId: string) {
    return this.subsService.getUserSubscriptions(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subscription details' })
  async get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.subsService.getSubscription(id, userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel subscription' })
  async cancel(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: CancelSubscriptionDto) {
    return this.subsService.cancelSubscription(id, userId, dto.reason);
  }

  @Post(':id/change-plan')
  @ApiOperation({ summary: 'Change subscription plan' })
  async changePlan(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ChangePlanDto) {
    return this.subsService.changePlan(id, userId, dto.newPlanId, dto.couponCode);
  }

  @Post('renew-all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Process all due renewals (admin)' })
  async renewAll() {
    return this.subsService.renewAllDue();
  }

  @Post('process-grace-periods')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Process grace period expirations (admin)' })
  async processGracePeriods() {
    return this.subsService.processGracePeriods();
  }

  @Get('admin/all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all subscriptions (admin)' })
  async adminList(@Query() query: AdminSubscriptionQueryDto) {
    return this.subsService.adminListSubscriptions(query);
  }

  @Get('admin/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get subscription details (admin)' })
  async adminGet(@Param('id') id: string) {
    return this.subsService.adminGetSubscription(id);
  }

  @Post('admin/:id/cancel')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Cancel subscription (admin)' })
  async adminCancel(@CurrentUser('id') adminUserId: string, @Param('id') id: string) {
    return this.subsService.adminCancelSubscription(id, adminUserId);
  }

  @Post('admin/:id/refund')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Refund subscription credits (admin)' })
  async adminRefund(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() dto: AdminRefundDto) {
    return this.subsService.adminRefundSubscription(id, Number(dto.amount), adminUserId);
  }
}
