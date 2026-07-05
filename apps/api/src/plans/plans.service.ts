import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlansRepository } from './plans.repository';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plansRepo: PlansRepository,
  ) {}

  // ─── Plan Categories ────────────────────────────────────────

  async createCategory(data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const existing = await this.plansRepo.findCategoryByName(data.name);
    if (existing) throw new BadRequestException('Category with this name already exists');

    return this.prisma.$transaction(async (tx: any) => {
      const category = await this.plansRepo.createCategory({
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      }, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan-category.create',
          resource: 'planCategory',
          resourceId: category.id,
          metadata: { name: data.name },
        },
      });

      return category;
    });
  }

  async listCategories() {
    return this.plansRepo.findCategories();
  }

  async getCategory(id: string) {
    const category = await this.plansRepo.findCategoryById(id);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async updateCategory(id: string, data: any) {
    const category = await this.getCategory(id);

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.plansRepo.updateCategory(id, data, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan-category.update',
          resource: 'planCategory',
          resourceId: id,
          metadata: { name: category.name },
        },
      });

      return updated;
    });
  }

  async deleteCategory(id: string) {
    const category = await this.getCategory(id);
    const count = await this.plansRepo.countPlansByCategory(id);
    if (count > 0) {
      throw new BadRequestException('Cannot delete category with existing plans');
    }

    return this.prisma.$transaction(async (tx: any) => {
      await this.plansRepo.deleteCategory(id, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan-category.delete',
          resource: 'planCategory',
          resourceId: id,
          metadata: { name: category.name },
        },
      });
    });
  }

  // ─── Plans ──────────────────────────────────────────────────

  async createPlan(data: {
    categoryId?: string;
    name: string;
    description?: string;
    priceCredits: number;
    billingPeriodDays?: number;
    cpuCores: number;
    memoryMb: number;
    diskGb: number;
    backupLimit?: number;
    snapshotLimit?: number;
    serverLimit?: number;
    nodeIds?: number[];
    templateId?: string;
    allowedUpgradePlanIds?: string[];
    allowedDowngradePlanIds?: string[];
    extraChargePercent?: number;
    extraChargeName?: string;
    taxRatePercent?: number;
    minSubscriptionDays?: number;
    maxSubscriptions?: number;
    enableCustomPricing?: boolean;
    cardBackgroundImage?: string;
    sliderConfig?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    if (data.categoryId) {
      const category = await this.plansRepo.findCategoryById(data.categoryId);
      if (!category) throw new BadRequestException('Category not found');
    }

    if (data.templateId) {
      const template = await this.plansRepo.findTemplateById(data.templateId);
      if (!template) throw new BadRequestException('VM Template not found');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const plan = await this.plansRepo.createPlan({
        categoryId: data.categoryId,
        name: data.name,
        description: data.description,
        priceCredits: data.priceCredits,
        billingPeriodDays: data.billingPeriodDays ?? 30,
        cpuCores: data.cpuCores,
        memoryMb: data.memoryMb,
        diskGb: data.diskGb,
        backupLimit: data.backupLimit ?? 0,
        snapshotLimit: data.snapshotLimit ?? 0,
        serverLimit: data.serverLimit ?? 1,
        nodeIds: data.nodeIds ?? null,
        templateId: data.templateId,
        allowedUpgradePlanIds: data.allowedUpgradePlanIds ?? null,
        allowedDowngradePlanIds: data.allowedDowngradePlanIds ?? null,
        extraChargePercent: data.extraChargePercent ?? 0,
        extraChargeName: data.extraChargeName,
        taxRatePercent: data.taxRatePercent ?? 0,
        minSubscriptionDays: data.minSubscriptionDays ?? 0,
        maxSubscriptions: data.maxSubscriptions,
        enableCustomPricing: data.enableCustomPricing ?? false,
        cardBackgroundImage: data.cardBackgroundImage,
        sliderConfig: data.sliderConfig ?? null,
        isActive: data.isActive ?? true,
      }, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan.create',
          resource: 'plan',
          resourceId: plan.id,
          metadata: { name: data.name, priceCredits: data.priceCredits },
        },
      });

      return plan;
    });
  }

  async listPlans(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return this.plansRepo.findPlans(where);
  }

  async getPlan(id: string) {
    const plan = await this.plansRepo.findPlanById(id, {
      category: true,
      coupons: { where: { isActive: true } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async updatePlan(id: string, data: any) {
    const plan = await this.getPlan(id);

    if (data.categoryId) {
      const category = await this.plansRepo.findCategoryById(data.categoryId);
      if (!category) throw new BadRequestException('Category not found');
    }

    if (data.templateId) {
      const template = await this.plansRepo.findTemplateById(data.templateId);
      if (!template) throw new BadRequestException('VM Template not found');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.plansRepo.updatePlan(id, data, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan.update',
          resource: 'plan',
          resourceId: id,
          metadata: { name: plan.name },
        },
      });

      return updated;
    });
  }

  async deletePlan(id: string) {
    const plan = await this.getPlan(id);

    return this.prisma.$transaction(async (tx: any) => {
      await this.plansRepo.deletePlan(id, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan.delete',
          resource: 'plan',
          resourceId: id,
          metadata: { name: plan.name },
        },
      });
    });
  }

  // ─── Plan Coupons ───────────────────────────────────────────

  async createCoupon(
    planId: string,
    data: {
      code: string;
      discountPercent?: number;
      discountCredits?: number;
      couponScope?: string;
      maxUses?: number;
      expiresAt?: string;
      isActive?: boolean;
    },
  ) {
    await this.getPlan(planId);

    const existing = await this.plansRepo.findCouponByCode(data.code);
    if (existing) throw new BadRequestException('Coupon code already exists');

    if (!data.discountPercent && !data.discountCredits) {
      throw new BadRequestException('Either discountPercent or discountCredits is required');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const coupon = await this.plansRepo.createCoupon({
        planId,
        code: data.code,
        discountPercent: data.discountPercent,
        discountCredits: data.discountCredits,
        couponScope: data.couponScope ?? 'both',
        maxUses: data.maxUses ?? 1,
        currentUses: 0,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isActive: data.isActive ?? true,
      }, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan-coupon.create',
          resource: 'planCoupon',
          resourceId: coupon.id,
          metadata: { planId, code: data.code },
        },
      });

      return coupon;
    });
  }

  async listCoupons(planId: string) {
    return this.plansRepo.findCouponsByPlan(planId);
  }

  async getCoupon(id: string) {
    const coupon = await this.plansRepo.findCouponById(id);
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  async validateCoupon(planId: string, code: string) {
    const plan = await this.plansRepo.findPlanById(planId);
    if (!plan) throw new NotFoundException('Plan not found');

    const coupon = await this.plansRepo.findCouponByCode(code);
    if (!coupon) throw new BadRequestException('Invalid coupon code');
    if (coupon.planId !== planId) throw new BadRequestException('Coupon does not apply to this plan');
    if (!coupon.isActive) throw new BadRequestException('Coupon is deactivated');
    if (coupon.expiresAt && new Date() > coupon.expiresAt) throw new BadRequestException('Coupon has expired');
    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) throw new BadRequestException('Coupon has reached maximum uses');

    return {
      valid: true,
      discountPercent: coupon.discountPercent,
      discountCredits: coupon.discountCredits,
      couponScope: coupon.couponScope,
      couponId: coupon.id,
    };
  }

  async updateCoupon(id: string, data: any) {
    await this.getCoupon(id);

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.plansRepo.updateCoupon(id, data, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan-coupon.update',
          resource: 'planCoupon',
          resourceId: id,
        },
      });

      return updated;
    });
  }

  async deleteCoupon(id: string) {
    await this.getCoupon(id);

    return this.prisma.$transaction(async (tx: any) => {
      await this.plansRepo.deleteCoupon(id, tx);

      await tx.auditLog.create({
        data: {
          action: 'plan-coupon.delete',
          resource: 'planCoupon',
          resourceId: id,
        },
      });
    });
  }

  async incrementCouponUses(id: string, tx?: any) {
    return this.plansRepo.updateCoupon(id, { currentUses: { increment: 1 } }, tx);
  }
}
