import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findCategoryById(id: string, tx?: PrismaTx) {
    return this.db(tx).planCategory.findUnique({ where: { id } });
  }

  async findCategoryByName(name: string, tx?: PrismaTx) {
    return this.db(tx).planCategory.findFirst({ where: { name } });
  }

  async findCategories(tx?: PrismaTx) {
    return this.db(tx).planCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { plans: { where: { isActive: true } } },
    });
  }

  async createCategory(data: any, tx?: PrismaTx) {
    return this.db(tx).planCategory.create({ data });
  }

  async updateCategory(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).planCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string, tx?: PrismaTx) {
    return this.db(tx).planCategory.delete({ where: { id } });
  }

  async findPlanById(id: string, include?: any, tx?: PrismaTx) {
    return this.db(tx).plan.findUnique({ where: { id }, include });
  }

  async findPlans(where?: any, tx?: PrismaTx) {
    return this.db(tx).plan.findMany({
      where,
      include: { category: true, coupons: true },
      orderBy: { priceCredits: 'asc' },
    });
  }

  async createPlan(data: any, tx?: PrismaTx) {
    return this.db(tx).plan.create({ data });
  }

  async updatePlan(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).plan.update({ where: { id }, data });
  }

  async deletePlan(id: string, tx?: PrismaTx) {
    return this.db(tx).plan.delete({ where: { id } });
  }

  async countPlansByCategory(categoryId: string, tx?: PrismaTx) {
    return this.db(tx).plan.count({ where: { categoryId } });
  }

  async findCouponById(id: string, tx?: PrismaTx) {
    return this.db(tx).planCoupon.findUnique({ where: { id } });
  }

  async findCouponByCode(code: string, tx?: PrismaTx) {
    return this.db(tx).planCoupon.findUnique({ where: { code } });
  }

  async findCouponsByPlan(planId: string, tx?: PrismaTx) {
    return this.db(tx).planCoupon.findMany({ where: { planId } });
  }

  async createCoupon(data: any, tx?: PrismaTx) {
    return this.db(tx).planCoupon.create({ data });
  }

  async updateCoupon(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).planCoupon.update({ where: { id }, data });
  }

  async deleteCoupon(id: string, tx?: PrismaTx) {
    return this.db(tx).planCoupon.delete({ where: { id } });
  }

  async findTemplateById(id: string, tx?: PrismaTx) {
    return this.db(tx).vmTemplate.findUnique({ where: { id } });
  }
}
