import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ProxmoxNode {
  node: string;
  status: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
}

export interface ProxmoxVm {
  vmid: number;
  name: string;
  status: string;
  mem: number;
  maxmem: number;
  cpus: number;
  disk: number;
  maxdisk: number;
}

export interface ProxmoxVmConfig {
  vmid: number;
  name: string;
  cores?: number;
  memory?: number;
  ostype?: string;
  [key: string]: unknown;
}

export interface ProxmoxCreateVmOptions {
  vmid: number;
  name: string;
  cores: number;
  memory: number;
  disk: number;
  storage: string;
  iso?: string;
  cloudInitConfig?: Record<string, string>;
  net?: string;
}

@Injectable()
export class ProxmoxService implements OnModuleInit {
  private readonly logger = new Logger(ProxmoxService.name);
  private readonly client: AxiosInstance;
  private readonly host: string;
  private readonly tokenId: string;
  private readonly tokenSecret: string;
  private readonly defaultNode: string;
  private readonly defaultStorage: string;
  private initialized = false;

  constructor(configService: ConfigService) {
    this.host = configService.get<string>('PROXMOX_HOST', '');
    this.tokenId = configService.get<string>('PROXMOX_API_TOKEN_ID', '');
    this.tokenSecret = configService.get<string>('PROXMOX_API_TOKEN_SECRET', '');
    this.defaultNode = configService.get<string>('PROXMOX_NODE', 'pve');
    this.defaultStorage = configService.get<string>('PROXMOX_STORAGE', 'local-lvm');

    const baseURL = this.host
      ? `https://${this.host}/api2/json`
      : 'http://localhost:8006/api2/json';

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  onModuleInit() {
    if (this.host && this.tokenId && this.tokenSecret) {
      this.client.interceptors.request.use((config) => {
        config.headers.Authorization = `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`;
        return config;
      });
      this.initialized = true;
      this.logger.log(`Proxmox service initialized for host ${this.host}`);
    } else {
      this.logger.warn('Proxmox credentials not configured — service will return empty/mock data');
    }
  }

  private assertInitialized() {
    if (!this.initialized) {
      throw new Error('Proxmox service is not configured. Set PROXMOX_HOST, PROXMOX_API_TOKEN_ID, and PROXMOX_API_TOKEN_SECRET.');
    }
  }

  private async get<T>(path: string): Promise<T> {
    this.assertInitialized();
    const { data } = await this.client.get<{ data: T }>(path);
    return data.data;
  }

  private async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    this.assertInitialized();
    const { data } = await this.client.post<{ data: T }>(path, body);
    return data.data;
  }

  private async del<T>(path: string): Promise<T> {
    this.assertInitialized();
    const { data } = await this.client.delete<{ data: T }>(path);
    return data.data;
  }

  async getNodes(): Promise<ProxmoxNode[]> {
    return this.get<ProxmoxNode[]>('/nodes');
  }

  async getNodeStatus(node: string = this.defaultNode): Promise<ProxmoxNode> {
    const nodes = await this.getNodes();
    const found = nodes.find((n) => n.node === node);
    if (!found) throw new Error(`Node "${node}" not found`);
    return found;
  }

  async getVms(node: string = this.defaultNode): Promise<ProxmoxVm[]> {
    return this.get<ProxmoxVm[]>(`/nodes/${node}/qemu`);
  }

  async getVmStatus(node: string, vmid: number): Promise<ProxmoxVm> {
    return this.get<ProxmoxVm>(`/nodes/${node}/qemu/${vmid}/status/current`);
  }

  async getVmConfig(node: string, vmid: number): Promise<ProxmoxVmConfig> {
    return this.get<ProxmoxVmConfig>(`/nodes/${node}/qemu/${vmid}/config`);
  }

  async createVm(
    options: ProxmoxCreateVmOptions,
    node: string = this.defaultNode,
  ): Promise<{ vmid: number }> {
    const body: Record<string, unknown> = {
      vmid: options.vmid,
      name: options.name,
      cores: options.cores,
      memory: options.memory,
      ostype: 'l26',
      net: options.net ?? 'virtio,bridge=vmbr0',
      storage: options.storage ?? this.defaultStorage,
      disks: `virtio0:${options.disk},format=qcow2`,
    };

    if (options.iso) {
      body.cdrom = `local:iso/${options.iso},media=cdrom`;
    }

    if (options.cloudInitConfig) {
      Object.assign(body, options.cloudInitConfig);
    }

    return this.post<{ vmid: number }>(`/nodes/${node}/qemu`, body);
  }

  async startVm(vmid: number, node: string = this.defaultNode): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/status/start`);
  }

  async stopVm(vmid: number, node: string = this.defaultNode): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/status/stop`);
  }

  async shutdownVm(vmid: number, node: string = this.defaultNode): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/status/shutdown`);
  }

  async restartVm(vmid: number, node: string = this.defaultNode): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/status/reboot`);
  }

  async deleteVm(vmid: number, node: string = this.defaultNode): Promise<string> {
    return this.del<string>(`/nodes/${node}/qemu/${vmid}`);
  }

  async suspendVm(vmid: number, node: string = this.defaultNode): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/status/suspend`);
  }

  async resumeVm(vmid: number, node: string = this.defaultNode): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/status/resume`);
  }

  async createSnapshot(
    vmid: number,
    name: string,
    node: string = this.defaultNode,
  ): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/snapshot`, {
      snapname: name,
    });
  }

  async listSnapshots(vmid: number, node: string = this.defaultNode): Promise<unknown[]> {
    return this.get<unknown[]>(`/nodes/${node}/qemu/${vmid}/snapshot`);
  }

  async deleteSnapshot(
    vmid: number,
    name: string,
    node: string = this.defaultNode,
  ): Promise<string> {
    return this.del<string>(`/nodes/${node}/qemu/${vmid}/snapshot/${name}`);
  }

  async getVncTicket(
    vmid: number,
    node: string = this.defaultNode,
  ): Promise<{ ticket: string; port: string; cert: string }> {
    const result = await this.post<{ ticket: string; port: string; cert: string }>(
      `/nodes/${node}/qemu/${vmid}/vncproxy`,
    );
    return result;
  }

  async getNodeVersion(node: string = this.defaultNode): Promise<{ version: string; release: string; repoid: string }> {
    return this.get<{ version: string; release: string; repoid: string }>(`/nodes/${node}/version`);
  }

  async getClusterResources(type?: string): Promise<unknown[]> {
    const path = type ? `/cluster/resources?type=${type}` : '/cluster/resources';
    return this.get<unknown[]>(path);
  }

  async getStoragePools(node: string = this.defaultNode): Promise<unknown[]> {
    return this.get<unknown[]>(`/nodes/${node}/storage`);
  }

  async getStorageContent(
    storage: string,
    node: string = this.defaultNode,
  ): Promise<unknown[]> {
    return this.get<unknown[]>(`/nodes/${node}/storage/${storage}/content`);
  }

  async getTemplates(node: string = this.defaultNode): Promise<unknown[]> {
    return this.get<unknown[]>(`/nodes/${node}/qemu?full=1`).then((vms) =>
      (vms as ProxmoxVm[]).filter((vm) => vm.name?.includes('template') || (vm as any).template === 1),
    );
  }

  async cloneVm(
    vmid: number,
    newId: number,
    options?: { name?: string; target?: string; full?: number },
    node: string = this.defaultNode,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      newid: newId,
      ...(options?.name && { name: options.name }),
      ...(options?.target && { target: options.target }),
      ...(options?.full !== undefined && { full: options.full }),
    };
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/clone`, body);
  }

  async getNextVmid(): Promise<number> {
    return this.get<number>('/cluster/nextid');
  }
}
