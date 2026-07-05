import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResourcePackagesRepository } from './resource-packages.repository';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class ResourcePackagesService {
  private readonly logger = new Logger(ResourcePackagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ResourcePackagesRepository,
    private readonly walletService: WalletService,
  ) {}

  // ─── Admin: Package CRUD ─────────────────────────────────────

  async createPackage(data: {
    name: string;
    description?: string;
    memoryLimit: number;
    cpuLimit: number;
    diskLimit: number;
    serverLimit?: number;
    backupLimit?: number;
    snapshotLimit?: number;
    priceCredits: number;
    isActive?: boolean;
    sortOrder?: number;
    discountPercent?: number;
    discountStart?: string;
    discountEnd?: string;
    discountEnabled?: boolean;
  }) {
    return this.prisma.$transaction(async (tx: any) => {
      const pkg = await this.repo.create({
        name: data.name,
        description: data.description,
        memoryLimit: data.memoryLimit,
        cpuLimit: data.cpuLimit,
        diskLimit: data.diskLimit,
        serverLimit: data.serverLimit ?? 1,
        backupLimit: data.backupLimit ?? 0,
        snapshotLimit: data.snapshotLimit ?? 0,
        priceCredits: data.priceCredits,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
        discountPercent: data.discountPercent ?? 0,
        discountStart: data.discountStart ? new Date(data.discountStart) : null,
        discountEnd: data.discountEnd ? new Date(data.discountEnd) : null,
        discountEnabled: data.discountEnabled ?? false,
      }, tx);

      await tx.auditLog.create({
        data: {
          action: 'resource-package.create',
          resource: 'resourcePackage',
          resourceId: pkg.id,
          metadata: { name: data.name, priceCredits: data.priceCredits },
        },
      });

      return pkg;
    });
  }

  async listPackages(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return this.repo.findMany(where);
  }

  async getPackage(id: string) {
    const pkg = await this.repo.findById(id);
    if (!pkg) throw new NotFoundException('Resource package not found');
    return pkg;
  }

  async updatePackage(id: string, data: any) {
    const pkg = await this.getPackage(id);

    return this.prisma.$transaction(async (tx: any) => {
      const updateData: any = { ...data };
      if (data.discountStart) updateData.discountStart = new Date(data.discountStart);
      if (data.discountEnd) updateData.discountEnd = new Date(data.discountEnd);

      const updated = await this.repo.update(id, updateData, tx);

      await tx.auditLog.create({
        data: {
          action: 'resource-package.update',
          resource: 'resourcePackage',
          resourceId: id,
          metadata: { name: pkg.name },
        },
      });

      return updated;
    });
  }

  async deletePackage(id: string) {
    const pkg = await this.getPackage(id);

    return this.prisma.$transaction(async (tx: any) => {
      const purchases = await this.repo.findPurchasesByUser(id);
      if (purchases.length > 0) {
        throw new BadRequestException('Cannot delete package with existing purchases');
      }

      await this.repo.delete(id, tx);

      await tx.auditLog.create({
        data: {
          action: 'resource-package.delete',
          resource: 'resourcePackage',
          resourceId: id,
          metadata: { name: pkg.name },
        },
      });
    });
  }

  // ─── Customer: Purchase ──────────────────────────────────────

  async purchasePackage(userId: string, packageId: string) {
    const pkg = await this.getPackage(packageId);
    if (!pkg.isActive) throw new BadRequestException('Resource package is not active');

    let effectivePrice = pkg.priceCredits;

    if (pkg.discountEnabled && pkg.discountPercent && pkg.discountPercent > 0) {
      const now = new Date();
      const withinWindow = (!pkg.discountStart || pkg.discountStart <= now) &&
        (!pkg.discountEnd || now <= pkg.discountEnd);
      if (withinWindow) {
        effectivePrice = Math.round(effectivePrice * (1 - pkg.discountPercent / 100));
      }
    }

    const existing = await this.repo.findPurchasesByUser(userId);
    const existingSame = existing.filter((p: any) => p.packageId === packageId);
    const maxPurchases = pkg.serverLimit;
    if (maxPurchases > 0 && existingSame.length >= maxPurchases) {
      throw new BadRequestException(`Maximum purchases (${maxPurchases}) reached for this package`);
    }

    return this.prisma.$transaction(async (tx: any) => {
      try {
        await this.walletService.debit(userId, effectivePrice, `resource-package:${packageId}`, {
          packageName: pkg.name,
        });
      } catch (error) {
        throw new BadRequestException(
          `Insufficient balance: need ${effectivePrice} cents. ${(error as Error).message}`,
        );
      }

      const purchase = await this.repo.createPurchase({
        userId,
        packageId,
        priceCredits: effectivePrice,
        memoryLimit: pkg.memoryLimit,
        cpuLimit: pkg.cpuLimit,
        diskLimit: pkg.diskLimit,
        serverLimit: pkg.serverLimit,
        backupLimit: pkg.backupLimit,
        snapshotLimit: pkg.snapshotLimit,
      }, tx);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'resource-package.purchase',
          resource: 'resourcePackagePurchase',
          resourceId: purchase.id,
          metadata: {
            packageId,
            packageName: pkg.name,
            priceCredits: effectivePrice,
          },
        },
      });

      this.logger.log(`User ${userId} purchased resource package ${pkg.name} (${purchase.id})`);

      return purchase;
    });
  }

  async getUserPurchases(userId: string) {
    return this.repo.findPurchasesByUser(userId);
  }

  async getPurchase(id: string, _userId?: string) {
    const purchase = await this.repo.findPurchaseById(id);
    if (!purchase) throw new NotFoundException('Purchase not found');

    return purchase;
  }

  async getAccumulatedLimits(userId: string) {
    const purchases = await this.repo.findPurchasesByUser(userId);
    return {
      memoryMb: purchases.reduce((sum: number, p: any) => sum + p.memoryLimit, 0),
      cpuCores: purchases.reduce((sum: number, p: any) => sum + p.cpuLimit, 0),
      diskGb: purchases.reduce((sum: number, p: any) => sum + p.diskLimit, 0),
      serverLimit: purchases.reduce((sum: number, p: any) => sum + p.serverLimit, 0),
      backupLimit: purchases.reduce((sum: number, p: any) => sum + p.backupLimit, 0),
      snapshotLimit: purchases.reduce((sum: number, p: any) => sum + p.snapshotLimit, 0),
    };
  }
}
