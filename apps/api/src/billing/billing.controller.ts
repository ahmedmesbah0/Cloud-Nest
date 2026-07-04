import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
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
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Run hourly billing tick (admin)' })
  async tick() {
    return this.billingService.runHourlyBilling();
  }

  @Post('reconcile')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Reconcile DB VM states with Proxmox (admin)' })
  async reconcile() {
    return this.billingService.reconcile();
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices for the current user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listInvoices(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billingService.listInvoices(userId, Number(page) || 1, Number(limit) || 20);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice detail with line items' })
  async getInvoice(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.billingService.getInvoice(userId, id);
  }
}
