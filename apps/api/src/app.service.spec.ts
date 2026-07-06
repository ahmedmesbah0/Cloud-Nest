import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

const mockPrisma = {
  $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
};

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should return health ok', async () => {
    const result = await service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('ok');
  });

  it('should return degraded when db fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('error');
  });
});
