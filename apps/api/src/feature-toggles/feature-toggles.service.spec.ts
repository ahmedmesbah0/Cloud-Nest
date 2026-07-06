import { Test, TestingModule } from '@nestjs/testing';
import { FeatureTogglesService } from './feature-toggles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FeatureTogglesService', () => {
  let service: FeatureTogglesService;
  let mockPrisma: any;

  const settings = new Map<string, { key: string; value: string }>();

  beforeEach(async () => {
    settings.clear();

    mockPrisma = {
      setting: {
        findMany: jest.fn(async ({ where: { key } }: any) => {
          if (key?.startsWith) {
            return Array.from(settings.values()).filter((s) => s.key.startsWith('feature.'));
          }
          return Array.from(settings.values());
        }),
        findUnique: jest.fn(async ({ where: { key } }: any) => settings.get(key) ?? null),
        upsert: jest.fn(async ({ where: { key }, update, create }: any) => {
          const existing = settings.get(key);
          if (existing) {
            settings.set(key, { ...existing, value: update.value });
          } else {
            settings.set(key, create);
          }
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureTogglesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeatureTogglesService>(FeatureTogglesService);
  });

  it('returns defaults when no settings exist', async () => {
    const toggles = await service.getAll();
    expect(toggles['self-service-delete']).toBe(true);
    expect(toggles['passkey-auth']).toBe(true);
  });

  it('overrides a feature toggle', async () => {
    await service.set('self-service-delete', false);
    const toggles = await service.getAll();
    expect(toggles['self-service-delete']).toBe(false);
  });

  it('isEnabled returns default for unknown key', async () => {
    const enabled = await service.isEnabled('nonexistent-feature');
    expect(enabled).toBe(true);
  });

  it('isEnabled returns persisted value', async () => {
    await service.set('custom-iso', false);
    const enabled = await service.isEnabled('custom-iso');
    expect(enabled).toBe(false);
  });

  it('starts with untoggled defaults', async () => {
    settings.set('feature.self-service-delete', { key: 'feature.self-service-delete', value: 'false' });
    // but we also set passkey-auth to false just for test
    settings.set('feature.passkey-auth', { key: 'feature.passkey-auth', value: 'false' });
    const toggles = await service.getAll();
    expect(toggles['self-service-delete']).toBe(false);
    expect(toggles['passkey-auth']).toBe(false);
    expect(toggles['custom-iso']).toBe(true); // still default
  });
});
