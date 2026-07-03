import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProxmoxService } from './proxmox.service';

jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return {
    create: jest.fn(() => mockAxiosInstance),
    default: mockAxiosInstance,
  };
});

import axios from 'axios';

describe('ProxmoxService', () => {
  let service: ProxmoxService;
  let mockClient: any;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const cfg: Record<string, any> = {
        PROXMOX_HOST: '172.16.1.10:8006',
        PROXMOX_API_TOKEN_ID: 'test',
        PROXMOX_API_TOKEN_SECRET: 'b978ae8c-f6ea-4bc3-8b3c-c09986b0a7fe',
        PROXMOX_NODE: 'pve',
        PROXMOX_STORAGE: 'local-lvm',
      };
      return cfg[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockClient = (axios.create as jest.Mock).mock.results[0]?.value ?? (axios as any).default;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxmoxService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ProxmoxService>(ProxmoxService);
    (service as any).initialized = true;
  });

  describe('getNodes', () => {
    it('returns a list of nodes', async () => {
      const mockNodes = [
        { node: 'pve', status: 'online', cpu: 0.1, maxcpu: 16, mem: 8192, maxmem: 65536, disk: 100, maxdisk: 4000 },
      ];
      mockClient.get.mockResolvedValue({ data: { data: mockNodes } });

      const result = await service.getNodes();
      expect(result).toEqual(mockNodes);
      expect(mockClient.get).toHaveBeenCalledWith('/nodes');
    });
  });

  describe('getNodeStatus', () => {
    it('returns the specified node', async () => {
      const mockNodes = [
        { node: 'pve', status: 'online', cpu: 0.1, maxcpu: 16, mem: 8192, maxmem: 65536, disk: 100, maxdisk: 4000 },
        { node: 'pve2', status: 'offline', cpu: 0, maxcpu: 8, mem: 0, maxmem: 32768, disk: 0, maxdisk: 2000 },
      ];
      mockClient.get.mockResolvedValue({ data: { data: mockNodes } });

      const result = await service.getNodeStatus('pve');
      expect(result.node).toBe('pve');
      expect(result.status).toBe('online');
    });

    it('throws when node not found', async () => {
      mockClient.get.mockResolvedValue({ data: { data: [] } });
      await expect(service.getNodeStatus('nonexistent')).rejects.toThrow('Node "nonexistent" not found');
    });
  });

  describe('getVms', () => {
    it('returns a list of VMs', async () => {
      const mockVms = [
        { vmid: 100, name: 'test-vm', status: 'running', mem: 512, maxmem: 1024, cpus: 1, disk: 5, maxdisk: 10 },
      ];
      mockClient.get.mockResolvedValue({ data: { data: mockVms } });

      const result = await service.getVms('pve');
      expect(result).toEqual(mockVms);
      expect(mockClient.get).toHaveBeenCalledWith('/nodes/pve/qemu');
    });
  });

  describe('createVm', () => {
    it('creates a VM and returns the vmid', async () => {
      const mockResponse = { vmid: 200 };
      mockClient.post.mockResolvedValue({ data: { data: mockResponse } });

      const result = await service.createVm({
        vmid: 200,
        name: 'test-vm',
        cores: 2,
        memory: 2048,
        disk: 20,
        storage: 'local-lvm',
      });

      expect(result).toEqual(mockResponse);
      expect(mockClient.post).toHaveBeenCalledWith('/nodes/pve/qemu', expect.objectContaining({
        vmid: 200,
        name: 'test-vm',
        cores: 2,
        memory: 2048,
      }));
    });

    it('accepts cloud-init config', async () => {
      mockClient.post.mockResolvedValue({ data: { data: { vmid: 201 } } });

      await service.createVm({
        vmid: 201,
        name: 'cloud-vm',
        cores: 1,
        memory: 1024,
        disk: 10,
        storage: 'local-lvm',
        cloudInitConfig: {
          'cipassword': 'test123',
          'sshkeys': 'ssh-rsa AAA...',
        },
      });

      expect(mockClient.post).toHaveBeenCalledWith('/nodes/pve/qemu', expect.objectContaining({
        cipassword: 'test123',
        sshkeys: 'ssh-rsa AAA...',
      }));
    });
  });

  describe('startVm / stopVm / deleteVm', () => {
    it('starts a VM', async () => {
      mockClient.post.mockResolvedValue({ data: { data: 'UPID:...' } });
      const result = await service.startVm(100);
      expect(result).toBe('UPID:...');
      expect(mockClient.post).toHaveBeenCalledWith('/nodes/pve/qemu/100/status/start', undefined);
    });

    it('stops a VM', async () => {
      mockClient.post.mockResolvedValue({ data: { data: 'UPID:...' } });
      const result = await service.stopVm(100);
      expect(result).toBe('UPID:...');
      expect(mockClient.post).toHaveBeenCalledWith('/nodes/pve/qemu/100/status/stop', undefined);
    });

    it('deletes a VM', async () => {
      mockClient.delete.mockResolvedValue({ data: { data: 'UPID:...' } });
      const result = await service.deleteVm(100);
      expect(result).toBe('UPID:...');
      expect(mockClient.delete).toHaveBeenCalledWith('/nodes/pve/qemu/100');
    });
  });

  describe('getVncTicket', () => {
    it('returns VNC ticket, port, and cert', async () => {
      const mockTicket = { ticket: 'ticket-abc', port: '5900', cert: 'cert-pem' };
      mockClient.post.mockResolvedValue({ data: { data: mockTicket } });

      const result = await service.getVncTicket(100);
      expect(result).toEqual(mockTicket);
      expect(mockClient.post).toHaveBeenCalledWith('/nodes/pve/qemu/100/vncproxy', undefined);
    });
  });

  describe('getNextVmid', () => {
    it('returns the next available VM ID', async () => {
      mockClient.get.mockResolvedValue({ data: { data: 300 } });
      const result = await service.getNextVmid();
      expect(result).toBe(300);
      expect(mockClient.get).toHaveBeenCalledWith('/cluster/nextid');
    });
  });

  describe('cloneVm', () => {
    it('clones a VM', async () => {
      mockClient.post.mockResolvedValue({ data: { data: 'UPID:clone-task' } });
      const result = await service.cloneVm(100, 200, { name: 'clone-vm', full: 1 });
      expect(result).toBe('UPID:clone-task');
      expect(mockClient.post).toHaveBeenCalledWith('/nodes/pve/qemu/100/clone', {
        newid: 200,
        name: 'clone-vm',
        full: 1,
      });
    });
  });

  describe('createSnapshot / listSnapshots / deleteSnapshot', () => {
    it('creates a snapshot', async () => {
      mockClient.post.mockResolvedValue({ data: { data: 'UPID:snapshot-task' } });
      const result = await service.createSnapshot(100, 'pre-update');
      expect(result).toBe('UPID:snapshot-task');
      expect(mockClient.post).toHaveBeenCalledWith('/nodes/pve/qemu/100/snapshot', { snapname: 'pre-update' });
    });

    it('lists snapshots', async () => {
      const mockSnapshots = [{ name: 'pre-update', snapstate: 'active' }];
      mockClient.get.mockResolvedValue({ data: { data: mockSnapshots } });
      const result = await service.listSnapshots(100);
      expect(result).toEqual(mockSnapshots);
    });

    it('deletes a snapshot', async () => {
      mockClient.delete.mockResolvedValue({ data: { data: 'UPID:delete-snap' } });
      const result = await service.deleteSnapshot(100, 'pre-update');
      expect(result).toBe('UPID:delete-snap');
      expect(mockClient.delete).toHaveBeenCalledWith('/nodes/pve/qemu/100/snapshot/pre-update');
    });
  });

  describe('not configured', () => {
    it('throws when not initialized', async () => {
      const uninitService = await Test.createTestingModule({
        providers: [
          ProxmoxService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => ''),
            },
          },
        ],
      }).compile().then((m) => m.get(ProxmoxService));

      await expect(uninitService.getNodes()).rejects.toThrow('Proxmox service is not configured');
    });
  });
});
