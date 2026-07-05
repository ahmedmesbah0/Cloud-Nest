import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsRepository } from './locations.repository';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly repo: LocationsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateLocationDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const location = await this.repo.create(dto, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'location.create',
          resource: 'location',
          resourceId: location.id,
          metadata: JSON.stringify({ name: dto.name, region: dto.region, country: dto.country }),
        },
      });
      return location;
    });
  }

  async findAll() {
    return this.repo.findAll();
  }

  async findById(id: string) {
    const location = await this.repo.findById(id);
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async update(id: string, dto: UpdateLocationDto, userId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Location not found');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.datacenter !== undefined) data.datacenter = dto.datacenter;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (Object.keys(data).length === 0) return existing;

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.repo.update(id, data, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'location.update',
          resource: 'location',
          resourceId: id,
          metadata: JSON.stringify(data),
        },
      });
      return updated;
    });
  }

  async delete(id: string, userId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Location not found');
    if (existing.nodes.length > 0) {
      throw new ConflictException('Cannot delete location with active nodes. Remove or reassign nodes first.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.repo.delete(id, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'location.delete',
          resource: 'location',
          resourceId: id,
          metadata: JSON.stringify({ name: existing.name }),
        },
      });
      return { message: 'Location deleted' };
    });
  }
}
