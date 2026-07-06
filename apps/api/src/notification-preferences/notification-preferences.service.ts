import { Injectable } from '@nestjs/common';
import { NotificationPreferencesRepository } from './notification-preferences.repository';

const DEFAULT_TYPES = [
  'billing.invoice',
  'billing.payment',
  'vm.backup',
  'vm.status',
  'support.ticket',
  'announcement',
  'api-key.foreign-ip',
  'security.login',
];

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly repo: NotificationPreferencesRepository) {}

  async list(userId: string) {
    const prefs = await this.repo.findByUserId(userId);
    const prefMap = new Map(prefs.map((p: any) => [p.type, p.muted]));
    return DEFAULT_TYPES.map((type) => ({
      type,
      muted: prefMap.get(type) ?? false,
    }));
  }

  async update(userId: string, type: string, muted: boolean) {
    return this.repo.upsert(userId, type, muted);
  }

  async getMutedTypes(userId: string): Promise<string[]> {
    return this.repo.findMutedTypes(userId);
  }
}
