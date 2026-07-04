import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIpPoolDto, UpdateIpPoolDto } from './dto/ip-pool.dto';

@Injectable()
export class IpPoolService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.ipPool.findMany({
      include: { _count: { select: { addresses: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const pool = await this.prisma.ipPool.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: { address: 'asc' } },
        _count: { select: { addresses: true } },
      },
    });
    if (!pool) throw new NotFoundException('IP pool not found');
    return pool;
  }

  async create(dto: CreateIpPoolDto) {
    return this.prisma.ipPool.create({
      data: { name: dto.name, subnet: dto.subnet, gateway: dto.gateway },
    });
  }

  async update(id: string, dto: UpdateIpPoolDto) {
    const pool = await this.prisma.ipPool.findUnique({ where: { id } });
    if (!pool) throw new NotFoundException('IP pool not found');

    return this.prisma.ipPool.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    const pool = await this.prisma.ipPool.findUnique({
      where: { id },
      include: { _count: { select: { addresses: true } } },
    });
    if (!pool) throw new NotFoundException('IP pool not found');
    if (pool._count.addresses > 0) {
      throw new BadRequestException('Cannot delete pool with assigned IPs');
    }
    await this.prisma.ipPool.delete({ where: { id } });
    return { success: true };
  }

  async addIp(poolId: string, address: string) {
    const pool = await this.prisma.ipPool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('IP pool not found');

    const existing = await this.prisma.ipAddress.findUnique({ where: { address } });
    if (existing) throw new ConflictException('IP address already exists in a pool');

    return this.prisma.ipAddress.create({
      data: { poolId, address },
    });
  }

  async removeIp(id: string) {
    const ip = await this.prisma.ipAddress.findUnique({ where: { id } });
    if (!ip) throw new NotFoundException('IP address not found');
    if (ip.isAssigned) throw new BadRequestException('Cannot remove an IP that is assigned to a VM');
    await this.prisma.ipAddress.delete({ where: { id } });
    return { success: true };
  }

  async setPtrRecord(ipId: string, ptrRecord: string) {
    const ip = await this.prisma.ipAddress.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP address not found');
    return this.prisma.ipAddress.update({
      where: { id: ipId },
      data: { ptrRecord },
    });
  }

  async getAvailableIp(poolId: string) {
    return this.prisma.ipAddress.findFirst({
      where: { poolId, isAssigned: false, vmId: null },
      orderBy: { address: 'asc' },
    });
  }
}
