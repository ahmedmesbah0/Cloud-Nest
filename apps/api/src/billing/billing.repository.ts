import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findVmsByStatus(statuses: string[], tx?: PrismaTx) {
    return this.db(tx).vm.findMany({
      where: { status: { in: statuses } },
      include: { user: true },
    });
  }

  async findVmById(id: string, tx?: PrismaTx) {
    return this.db(tx).vm.findUnique({ where: { id } });
  }

  async updateVm(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).vm.update({ where: { id }, data });
  }

  async findNodeById(id: string, tx?: PrismaTx) {
    return this.db(tx).node.findUnique({ where: { id } });
  }

  async findWalletByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).wallet.findUnique({ where: { userId } });
  }

  async findTransactions(where: any, orderBy?: any, take?: number, tx?: PrismaTx) {
    return this.db(tx).transaction.findMany({ where, orderBy, take });
  }

  async updateTransactions(where: any, data: any, tx?: PrismaTx) {
    return this.db(tx).transaction.updateMany({ where, data });
  }

  async createInvoice(data: any, tx?: PrismaTx) {
    return this.db(tx).invoice.create({ data });
  }

  async findInvoiceById(id: string, include?: any, tx?: PrismaTx) {
    return this.db(tx).invoice.findUnique({ where: { id }, include });
  }

  async findInvoices(userId: string, skip: number, take: number, tx?: PrismaTx) {
    const [invoices, total] = await Promise.all([
      this.db(tx).invoice.findMany({
        where: { userId },
        include: { lineItems: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db(tx).invoice.count({ where: { userId } }),
    ]);
    return { invoices, total };
  }
}
