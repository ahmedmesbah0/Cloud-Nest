import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferencesRepository } from './notification-preferences.repository';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let mockRepo: any;

  const prefs = new Map<string, any>();

  beforeEach(async () => {
    prefs.clear();

    mockRepo = {
      findByUserId: jest.fn(async (userId: string) =>
        Array.from(prefs.values())
          .filter((p: any) => p.userId === userId)
          .map((p: any) => ({ type: p.type, muted: p.muted })),
      ),
      upsert: jest.fn(async (userId: string, type: string, muted: boolean) => {
        prefs.set(`${userId}:${type}`, { userId, type, muted });
      }),
      findMutedTypes: jest.fn(async (userId: string) =>
        Array.from(prefs.values())
          .filter((p: any) => p.userId === userId && p.muted)
          .map((p: any) => p.type),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: NotificationPreferencesRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);
  });

  it('returns defaults when no prefs set', async () => {
    const list = await service.list('user-1');
    expect(list).toHaveLength(8);
    expect(list.every((p: any) => p.muted === false)).toBe(true);
  });

  it('mutes a type', async () => {
    await service.update('user-1', 'billing.invoice', true);
    const list = await service.list('user-1');
    expect(list.find((p: any) => p.type === 'billing.invoice')?.muted).toBe(true);
    expect(list.find((p: any) => p.type === 'vm.backup')?.muted).toBe(false);
  });

  it('returns muted types', async () => {
    await service.update('user-1', 'billing.invoice', true);
    await service.update('user-1', 'vm.status', true);
    const muted = await service.getMutedTypes('user-1');
    expect(muted).toEqual(expect.arrayContaining(['billing.invoice', 'vm.status']));
    expect(muted).toHaveLength(2);
  });

  it('mutes are per-user', async () => {
    await service.update('user-1', 'billing.invoice', true);
    const list2 = await service.list('user-2');
    expect(list2.every((p: any) => p.muted === false)).toBe(true);
  });
});
