import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class VmSubusersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findByVm(vmId: string, tx?: PrismaTx) {
    return this.db(tx).vmSubuser.findMany({
      where: { vmId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async findByVmAndUser(vmId: string, userId: string, tx?: PrismaTx) {
    return this.db(tx).vmSubuser.findUnique({
      where: { vmId_userId: { vmId, userId } },
    });
  }

  async create(data: { vmId: string; userId: string; permissions: string[] }, tx?: PrismaTx) {
    return this.db(tx).vmSubuser.create({ data });
  }

  async updatePermissions(id: string, permissions: string[], tx?: PrismaTx) {
    return this.db(tx).vmSubuser.update({ where: { id }, data: { permissions } });
  }

  async remove(id: string, tx?: PrismaTx) {
    return this.db(tx).vmSubuser.delete({ where: { id } });
  }

  async findUserByEmail(email: string, tx?: PrismaTx) {
    return this.db(tx).user.findUnique({ where: { email } });
  }
}
