import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanCategoryDto, UpdatePlanCategoryDto } from './dto/plan-category.dto';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { CreatePlanCouponDto, UpdatePlanCouponDto, ValidatePlanCouponDto } from './dto/plan-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@ApiTags('Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  // ─── Categories ─────────────────────────────────────────────

  @Post('categories')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a plan category (admin)' })
  async createCategory(@Body() dto: CreatePlanCategoryDto) {
    return this.plansService.createCategory(dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all plan categories' })
  async listCategories() {
    return this.plansService.listCategories();
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get a plan category' })
  async getCategory(@Param('id') id: string) {
    return this.plansService.getCategory(id);
  }

  @Put('categories/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a plan category (admin)' })
  async updateCategory(@Param('id') id: string, @Body() dto: UpdatePlanCategoryDto) {
    return this.plansService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a plan category (admin)' })
  async deleteCategory(@Param('id') id: string) {
    return this.plansService.deleteCategory(id);
  }

  // ─── Plans ──────────────────────────────────────────────────

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a plan (admin)' })
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.plansService.createPlan(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active plans' })
  async listPlans(@Query('all') all?: string) {
    return this.plansService.listPlans(all === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan details with coupons' })
  async getPlan(@Param('id') id: string) {
    return this.plansService.getPlan(id);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a plan (admin)' })
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.updatePlan(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a plan (admin)' })
  async deletePlan(@Param('id') id: string) {
    return this.plansService.deletePlan(id);
  }

  // ─── Coupons ────────────────────────────────────────────────

  @Post(':planId/coupons')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a coupon for a plan (admin)' })
  async createCoupon(@Param('planId') planId: string, @Body() dto: CreatePlanCouponDto) {
    return this.plansService.createCoupon(planId, dto);
  }

  @Get(':planId/coupons')
  @ApiOperation({ summary: 'List coupons for a plan' })
  async listCoupons(@Param('planId') planId: string) {
    return this.plansService.listCoupons(planId);
  }

  @Post(':planId/coupons/validate')
  @ApiOperation({ summary: 'Validate a coupon code for a plan' })
  async validateCoupon(@Param('planId') planId: string, @Body() dto: ValidatePlanCouponDto) {
    return this.plansService.validateCoupon(planId, dto.code);
  }

  @Get('coupons/:id')
  @ApiOperation({ summary: 'Get coupon details' })
  async getCoupon(@Param('id') id: string) {
    return this.plansService.getCoupon(id);
  }

  @Put('coupons/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a coupon (admin)' })
  async updateCoupon(@Param('id') id: string, @Body() dto: UpdatePlanCouponDto) {
    return this.plansService.updateCoupon(id, dto);
  }

  @Delete('coupons/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a coupon (admin)' })
  async deleteCoupon(@Param('id') id: string) {
    return this.plansService.deleteCoupon(id);
  }
}
