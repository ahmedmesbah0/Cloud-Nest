import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ProxmoxJobService } from './proxmox-job.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProxmoxJobService', () => {
  let service: ProxmoxJobService;
  let mockQueue: any;
  let mockPrisma: any;

  const mockIdempotencyKeys = new Map<string, any>();

  beforeEach(async () => {
    mockIdempotencyKeys.clear();

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-job-1' }),
    };

    mockPrisma = {
      idempotencyKey: {
        findUnique: jest.fn(({ where }: { where: { key: string } }) => {
          return mockIdempotencyKeys.get(where.key) ?? null;
        }),
        create: jest.fn(({ data }: { data: any }) => {
          mockIdempotencyKeys.set(data.key, data);
          return data;
        }),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxmoxJobService,
        { provide: getQueueToken('proxmox-jobs'), useValue: mockQueue },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProxmoxJobService>(ProxmoxJobService);
  });

  describe('enqueueJob', () => {
    it('enqueues a job with new idempotency key', async () => {
      const result = await service.enqueueJob('create-vm', {
        vmid: 100,
        name: 'test-vm',
      }, {
        userId: 'user-1',
        idempotencyKey: 'create-vm-abc123',
      });

      expect(result.status).toBe('queued');
      expect(result.skipped).toBeUndefined();
      expect(mockPrisma.idempotencyKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: 'create-vm-abc123',
          action: 'create-vm',
        }),
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'create-vm',
        expect.objectContaining({
          type: 'create-vm',
          idempotencyKey: 'create-vm-abc123',
        }),
        expect.objectContaining({ jobId: 'create-vm-abc123' }),
      );
    });

    it('skips enqueue when idempotency key already exists', async () => {
      mockIdempotencyKeys.set('create-vm-existing', {
        key: 'create-vm-existing',
        action: 'create-vm',
        status: 'pending',
      });

      const result = await service.enqueueJob('create-vm', {
        vmid: 100,
      }, {
        idempotencyKey: 'create-vm-existing',
      });

      expect(result.skipped).toBe(true);
      expect(result.status).toBe('pending');
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('auto-generates idempotency key if not provided', async () => {
      const result = await service.enqueueJob('start-vm', { vmid: 100 });
      expect(result.idempotencyKey).toMatch(/^start-vm-/);
      expect(result.status).toBe('queued');
    });
  });

  describe('getJobStatus', () => {
    it('returns idempotency key record', async () => {
      mockIdempotencyKeys.set('test-key', {
        key: 'test-key',
        action: 'start-vm',
        status: 'completed',
        completedAt: new Date(),
      });

      const result = await service.getJobStatus('test-key');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });

    it('returns null for unknown key', async () => {
      const result = await service.getJobStatus('nonexistent');
      expect(result).toBeNull();
    });
  });
});
