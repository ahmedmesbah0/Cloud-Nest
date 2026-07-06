import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureTogglesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly defaults: Record<string, boolean> = {
    'self-service-delete': true,
    'self-service-reinstall': true,
    'custom-iso': true,
    'backup-creation': true,
    'passkey-auth': true,
    'oauth2-apps': true,
  };

  async getAll(): Promise<Record<string, boolean>> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { startsWith: 'feature.' } },
    });
    const toggles: Record<string, boolean> = {};
    for (const [key, defaultValue] of Object.entries(this.defaults)) {
      const row = rows.find((r: any) => r.key === `feature.${key}`);
      toggles[key] = row ? row.value === 'true' : defaultValue;
    }
    return toggles;
  }

  async isEnabled(key: string): Promise<boolean> {
    const row = await this.prisma.setting.findUnique({
      where: { key: `feature.${key}` },
    });
    if (row) return row.value === 'true';
    return this.defaults[key] ?? true;
  }

  async set(key: string, enabled: boolean) {
    await this.prisma.setting.upsert({
      where: { key: `feature.${key}` },
      update: { value: String(enabled) },
      create: { key: `feature.${key}`, value: String(enabled) },
    });
    return this.getAll();
  }
}
