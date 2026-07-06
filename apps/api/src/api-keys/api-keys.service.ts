import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysRepository } from './api-keys.repository';
import { randomBytes } from 'node:crypto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeysRepo: ApiKeysRepository,
  ) {}

  private isIpAllowed(ip: string, allowedCidrs: string): boolean {
    if (!allowedCidrs) return true;
    const ranges = allowedCidrs.split(',').map((s) => s.trim()).filter(Boolean);
    if (ranges.length === 0) return true;
    return ranges.some((cidr) => {
      try {
        const [rangeIp, bits] = cidr.split('/');
        const mask = bits ? ~(2 ** (32 - Number(bits)) - 1) >>> 0 : 0xffffffff;
        const ipNum = ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
        const rangeNum = rangeIp.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
        return (ipNum & mask) === (rangeNum & mask);
      } catch {
        return false;
      }
    });
  }

  async list(userId: string) {
    return this.apiKeysRepo.findMany(userId);
  }

  async create(userId: string, name: string, allowedIps?: string, notifyForeignIp?: boolean) {
    const rawKey = `cn_${randomBytes(32).toString('hex')}`;
    const key = await this.prisma.$transaction(async (tx: any) => {
      const k = await this.apiKeysRepo.create(
        { userId, name, key: rawKey, allowedIps: allowedIps ?? null, notifyForeignIp: notifyForeignIp ?? true },
        tx,
      );
      await tx.auditLog.create({
        data: {
          userId,
          action: 'api-key.create',
          resource: 'apiKey',
          resourceId: k.id,
        },
      });
      return k;
    });
    return {
      id: key.id,
      name: key.name,
      key: key.key,
      allowedIps: key.allowedIps,
      notifyForeignIp: key.notifyForeignIp,
      createdAt: key.createdAt,
    };
  }

  async update(userId: string, id: string, data: { allowedIps?: string | null; notifyForeignIp?: boolean }) {
    const key = await this.apiKeysRepo.findById(id);
    if (!key || key.userId !== userId) throw new NotFoundException('API key not found');
    return this.apiKeysRepo.update(id, data);
  }

  async delete(userId: string, id: string) {
    const key = await this.apiKeysRepo.findById(id);
    if (!key || key.userId !== userId) throw new NotFoundException('API key not found');
    await this.prisma.$transaction(async (tx: any) => {
      await this.apiKeysRepo.delete(id, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'api-key.delete',
          resource: 'apiKey',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }

  async authenticate(rawKey: string, clientIp: string): Promise<{ userId: string; keyId: string }> {
    const key = await this.apiKeysRepo.findByKey(rawKey);
    if (!key) throw new UnauthorizedException('Invalid API key');

    if (key.allowedIps && !this.isIpAllowed(clientIp, key.allowedIps)) {
      await this.apiKeysRepo.updateLastUsed(key.id);
      throw new UnauthorizedException('API key not allowed from this IP address');
    }

    await this.apiKeysRepo.updateLastUsed(key.id);
    return { userId: key.userId, keyId: key.id };
  }
}
