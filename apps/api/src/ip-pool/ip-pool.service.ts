import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IpPoolRepository } from './ip-pool.repository';
import { CreateIpPoolDto, UpdateIpPoolDto } from './dto/ip-pool.dto';

@Injectable()
export class IpPoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ipPoolRepo: IpPoolRepository,
  ) {}

  async list() {
    return this.ipPoolRepo.findMany();
  }

  async get(id: string) {
    const pool = await this.ipPoolRepo.findById(id, true);
    if (!pool) throw new NotFoundException('IP pool not found');
    return pool;
  }

  async create(dto: CreateIpPoolDto) {
    return this.prisma.$transaction(async (tx: any) => {
      const pool = await this.ipPoolRepo.create(
        { name: dto.name, subnet: dto.subnet, gateway: dto.gateway },
        tx,
      );
      await tx.auditLog.create({
        data: {
          action: 'ip-pool.create',
          resource: 'ipPool',
          resourceId: pool.id,
        },
      });
      return pool;
    });
  }

  async update(id: string, dto: UpdateIpPoolDto) {
    const pool = await this.ipPoolRepo.findById(id);
    if (!pool) throw new NotFoundException('IP pool not found');

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.ipPoolRepo.update(id, dto, tx);
      await tx.auditLog.create({
        data: {
          action: 'ip-pool.update',
          resource: 'ipPool',
          resourceId: id,
        },
      });
      return updated;
    });
  }

  async delete(id: string) {
    const pool = await this.ipPoolRepo.findById(id);
    if (!pool) throw new NotFoundException('IP pool not found');
    if (pool._count.addresses > 0) {
      throw new BadRequestException('Cannot delete pool with assigned IPs');
    }
    await this.prisma.$transaction(async (tx: any) => {
      await this.ipPoolRepo.delete(id, tx);
      await tx.auditLog.create({
        data: {
          action: 'ip-pool.delete',
          resource: 'ipPool',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }

  async addIp(poolId: string, address: string) {
    const pool = await this.ipPoolRepo.findById(poolId);
    if (!pool) throw new NotFoundException('IP pool not found');

    const existing = await this.ipPoolRepo.findAddressByAddress(address);
    if (existing) throw new ConflictException('IP address already exists in a pool');

    return this.prisma.$transaction(async (tx: any) => {
      const ip = await this.ipPoolRepo.createAddress({ poolId, address }, tx);
      await tx.auditLog.create({
        data: {
          action: 'ip-pool.add-ip',
          resource: 'ipAddress',
          resourceId: ip.id,
        },
      });
      return ip;
    });
  }

  async removeIp(id: string) {
    const ip = await this.ipPoolRepo.findAddressById(id);
    if (!ip) throw new NotFoundException('IP address not found');
    if (ip.isAssigned) throw new BadRequestException('Cannot remove an IP that is assigned to a VM');
    await this.prisma.$transaction(async (tx: any) => {
      await this.ipPoolRepo.deleteAddress(id, tx);
      await tx.auditLog.create({
        data: {
          action: 'ip-pool.remove-ip',
          resource: 'ipAddress',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }

  async setPtrRecord(ipId: string, ptrRecord: string) {
    const ip = await this.ipPoolRepo.findAddressById(ipId);
    if (!ip) throw new NotFoundException('IP address not found');
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.ipPoolRepo.updateAddress(ipId, { ptrRecord }, tx);
      await tx.auditLog.create({
        data: {
          action: 'ip-pool.set-ptr',
          resource: 'ipAddress',
          resourceId: ipId,
        },
      });
      return updated;
    });
  }

  async getAvailableIp(poolId: string) {
    return this.ipPoolRepo.findAvailableIp(poolId);
  }
}
