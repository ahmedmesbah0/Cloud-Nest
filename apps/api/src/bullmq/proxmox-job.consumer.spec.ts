import { ProxmoxJobConsumer } from './proxmox-job.consumer';
import { ProxmoxJobData } from './proxmox-job.service';
import { Job } from 'bullmq';

function mockJob(data: ProxmoxJobData, overrides?: Partial<Job>): Job<ProxmoxJobData> {
  return {
    data,
    id: data.idempotencyKey,
    attemptsMade: 0,
    opts: { attempts: 5 },
    ...overrides,
  } as Job<ProxmoxJobData>;
}

function setupConsumer() {
  const mockProxmox = {
    assertVmManaged: jest.fn().mockResolvedValue(undefined),
    updateVmConfig: jest.fn().mockResolvedValue({}),
    resizeDisk: jest.fn().mockResolvedValue({}),
    getStorageContent: jest.fn().mockResolvedValue([]),
    deleteSnapshot: jest.fn().mockResolvedValue({}),
    backupVm: jest.fn().mockResolvedValue({ upid: 'UPID:abc' }),
    cloneVm: jest.fn().mockResolvedValue({}),
    startVm: jest.fn().mockResolvedValue({}),
    setVmTags: jest.fn().mockResolvedValue(undefined),
    stopVm: jest.fn().mockResolvedValue({}),
    addFirewallRule: jest.fn().mockResolvedValue({}),
    deleteFirewallRule: jest.fn().mockResolvedValue({}),
    downloadUrl: jest.fn().mockResolvedValue({}),
    mountIso: jest.fn().mockResolvedValue({}),
    ejectIso: jest.fn().mockResolvedValue({}),
    migrateVm: jest.fn().mockResolvedValue({}),
  };

  const mockPoolService = {
    releaseResources: jest.fn().mockResolvedValue(undefined),
    resizeAllocation: jest.fn().mockResolvedValue(undefined),
  };

  const mockVmService = {
    getVmWithIps: jest.fn(),
    updateVmStatus: jest.fn().mockResolvedValue({}),
    completeBackup: jest.fn().mockResolvedValue({}),
    completeSnapshot: jest.fn().mockResolvedValue({}),
    removeSnapshotRecord: jest.fn().mockResolvedValue({}),
    findBackupWithVm: jest.fn(),
    logAuditAction: jest.fn().mockResolvedValue(undefined),
  };

  const mockVmGateway = {
    emitVmStatusUpdate: jest.fn(),
    emitUserNotification: jest.fn(),
  };

  const mockJobService = {
    findIdempotencyKey: jest.fn(),
    completeIdempotencyKey: jest.fn().mockResolvedValue({}),
    failIdempotencyKey: jest.fn().mockResolvedValue({}),
  };

  const mockNotificationsService = {
    create: jest.fn().mockResolvedValue({}),
  };

  const consumer = new ProxmoxJobConsumer(
    mockProxmox as any,
    mockPoolService as any,
    mockVmService as any,
    mockVmGateway as any,
    mockJobService as any,
    mockNotificationsService as any,
  );

  return { consumer, mockProxmox, mockPoolService, mockVmService, mockVmGateway, mockJobService, mockNotificationsService };
}

describe('ProxmoxJobConsumer', () => {
  describe('process', () => {
    describe('idempotency key checks', () => {
      it('returns skipped when idempotency key is already completed', async () => {
        const { consumer, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'start-vm-completed',
          status: 'completed',
          action: 'start-vm',
        });

        const job = mockJob({
          type: 'start-vm',
          idempotencyKey: 'start-vm-completed',
          payload: { vmId: 'vm-1', vmid: 100 },
        });
        const result = await consumer.process(job);

        expect(result).toEqual({ skipped: true, status: 'completed' });
      });

      it('throws when idempotency key is not found', async () => {
        const { consumer, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue(null);

        const job = mockJob({
          type: 'start-vm',
          idempotencyKey: 'nonexistent',
          payload: { vmId: 'vm-1', vmid: 100 },
        });

        await expect(consumer.process(job)).rejects.toThrow(
          'Idempotency key "nonexistent" not found in database',
        );
      });
    });

    describe('successful execution', () => {
      it('updates idempotency key, VM status, and writes audit log on success', async () => {
        const { consumer, mockJobService, mockVmService, mockVmGateway, mockNotificationsService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'start-vm-abc',
          status: 'pending',
          action: 'start-vm',
        });
        mockVmService.updateVmStatus.mockResolvedValue({ id: 'vm-1' });

        const job = mockJob({
          type: 'start-vm',
          idempotencyKey: 'start-vm-abc',
          userId: 'user-1',
          auditLog: { action: 'start-vm', resource: 'vm', resourceId: 'vm-1' },
          payload: { vmId: 'vm-1', vmid: 100, name: 'test-vm' },
        });

        await consumer.process(job);

        // Idempotency key marked completed
        expect(mockJobService.completeIdempotencyKey).toHaveBeenCalledWith('start-vm-abc');

        // VM status updated
        expect(mockVmService.updateVmStatus).toHaveBeenCalledWith(
          'vm-1', 'running', expect.objectContaining({ status: 'running' }),
        );

        // WebSocket events emitted
        expect(mockVmGateway.emitVmStatusUpdate).toHaveBeenCalledWith(
          'vm-1', 'running', expect.any(Object),
        );
        expect(mockVmGateway.emitUserNotification).toHaveBeenCalledWith(
          'user-1', 'vm-notification', expect.any(Object),
        );

        // Audit log created
        expect(mockVmService.logAuditAction).toHaveBeenCalledWith({
          userId: 'user-1',
          action: 'start-vm',
          resource: 'vm',
          resourceId: 'vm-1',
          metadata: expect.objectContaining({ idempotencyKey: 'start-vm-abc' }),
        });

        // Notification created via service
        expect(mockNotificationsService.create).toHaveBeenCalled();
      });
    });

    describe('resize-vm pool check', () => {
      it('re-checks pool capacity with FOR UPDATE and updates allocation', async () => {
        const { consumer, mockVmService, mockPoolService, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'resize-vm-xyz',
          status: 'pending',
          action: 'resize-vm',
        });
        mockVmService.getVmWithIps.mockResolvedValue({
          id: 'vm-1',
          userId: 'user-1',
          cpuCores: 2,
          memoryMb: 2048,
          diskGb: 20,
        });
        mockVmService.updateVmStatus.mockResolvedValue({ id: 'vm-1' });

        const job = mockJob({
          type: 'resize-vm',
          idempotencyKey: 'resize-vm-xyz',
          payload: { vmId: 'vm-1', vmid: 100, cores: 4, memory: 4096, disk: 50 },
        });

        await consumer.process(job);

        // Pool resize via service
        expect(mockPoolService.resizeAllocation).toHaveBeenCalledWith(
          'vm-1', 4, 4096, 50, 'user-1',
        );
      });

      it('throws when pool capacity is insufficient', async () => {
        const { consumer, mockVmService, mockPoolService, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'resize-vm-insufficient',
          status: 'pending',
          action: 'resize-vm',
        });
        mockVmService.getVmWithIps.mockResolvedValue({
          id: 'vm-1',
          userId: 'user-1',
          cpuCores: 2,
          memoryMb: 2048,
          diskGb: 20,
        });
        mockPoolService.resizeAllocation.mockRejectedValue(new Error('Insufficient pool capacity for resize'));

        const job = mockJob({
          type: 'resize-vm',
          idempotencyKey: 'resize-vm-insufficient',
          payload: { vmId: 'vm-1', vmid: 100, cores: 4, memory: 4096, disk: 200 },
        });

        await expect(consumer.process(job)).rejects.toThrow(
          'Insufficient pool capacity for resize',
        );
      });
    });

    describe('delete-snapshot with silent catch', () => {
      it('silently swallows snapshot.delete errors (current behavior)', async () => {
        const { consumer, mockVmService, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'delete-snap-abc',
          status: 'pending',
          action: 'delete-snapshot',
        });
        mockVmService.removeSnapshotRecord.mockRejectedValue(new Error('Snapshot gone'));
        mockVmService.updateVmStatus.mockResolvedValue({ id: 'vm-1' });

        const job = mockJob({
          type: 'delete-snapshot',
          idempotencyKey: 'delete-snap-abc',
          userId: 'user-1',
          payload: { vmId: 'vm-1', vmid: 100, snapshotId: 'snap-1' },
        });

        await expect(consumer.process(job)).resolves.toBeDefined();
      });
    });

    describe('backup-vm flow', () => {
      it('updates backup record on completion', async () => {
        const { consumer, mockVmService, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'backup-vm-abc',
          status: 'pending',
          action: 'backup-vm',
        });
        mockVmService.findBackupWithVm.mockResolvedValue({
          id: 'backup-1',
          storage: 'local',
          vm: { node: { proxmoxNodeId: 'pve-node' } },
        });
        mockVmService.completeBackup.mockResolvedValue({ id: 'backup-1' });

        const job = mockJob({
          type: 'backup-vm',
          idempotencyKey: 'backup-vm-abc',
          payload: { vmId: 'vm-1', vmid: 100, backupId: 'backup-1' },
        });

        await consumer.process(job);

        expect(mockVmService.completeBackup).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('updates VM to error status and throws on job failure (silent catch on error update)', async () => {
        const { consumer, mockVmService, mockVmGateway, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'fail-vm-abc',
          status: 'pending',
          action: 'start-vm',
        });

        const job = mockJob({
          type: 'start-vm',
          idempotencyKey: 'fail-vm-abc',
          payload: { vmId: 'vm-1', vmid: 100 },
        });

        jest.spyOn(consumer as any, 'executeJob').mockRejectedValue(new Error('Proxmox failure'));

        await expect(consumer.process(job)).rejects.toThrow('Proxmox failure');

        // VM set to error
        expect(mockVmService.updateVmStatus).toHaveBeenCalledWith(
          'vm-1', 'error',
        );

        // Error emitted via WebSocket
        expect(mockVmGateway.emitVmStatusUpdate).toHaveBeenCalledWith(
          'vm-1', 'error', { error: 'Proxmox failure' },
        );
      });

      it('marks idempotency key as failed on final attempt', async () => {
        const { consumer, mockVmService, mockJobService } = setupConsumer();
        mockJobService.findIdempotencyKey.mockResolvedValue({
          key: 'fail-final',
          status: 'pending',
          action: 'start-vm',
        });
        mockVmService.updateVmStatus.mockResolvedValue({ id: 'vm-1' });

        const job = mockJob(
          {
            type: 'start-vm',
            idempotencyKey: 'fail-final',
            payload: { vmId: 'vm-1', vmid: 100 },
          },
          { attemptsMade: 4 },
        );

        jest.spyOn(consumer as any, 'executeJob').mockRejectedValue(new Error('Final failure'));

        try { await consumer.process(job); } catch { /* expected */ }

        // Final attempt: mark idempotency key as failed
        expect(mockJobService.failIdempotencyKey).toHaveBeenCalledWith('fail-final');
      });
    });
  });
});
