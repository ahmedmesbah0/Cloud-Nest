import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import https from 'node:https';
import { ProxmoxRepository } from './proxmox.repository';

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

export const CLOUDNEST_MANAGED_TAG = 'cloudnest-managed';

@Injectable()
export class ProxmoxService implements OnModuleInit {
  private readonly logger = new Logger(ProxmoxService.name);
  private readonly client: AxiosInstance;
  private host: string;
  private tokenId: string;
  private tokenSecret: string;
  private defaultNode: string;
  private defaultStorage: string;
  private initialized = false;

  constructor(
    configService: ConfigService,
    private readonly proxmoxRepository?: ProxmoxRepository,
  ) {
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
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
  }

  async onModuleInit() {
    await this.refreshConfig();
  }

  async refreshConfig() {
    if (this.proxmoxRepository) {
      try {
        const settings = await this.proxmoxRepository.findSettingsByKeys(
          ['proxmox_host', 'proxmox_token_id', 'proxmox_token_secret', 'proxmox_node', 'proxmox_storage'],
        );
        const map: Record<string, string> = {};
        for (const s of settings) map[s.key] = s.value;

        if (map.proxmox_host) this.host = map.proxmox_host;
        if (map.proxmox_token_id) this.tokenId = map.proxmox_token_id;
        if (map.proxmox_token_secret) this.tokenSecret = map.proxmox_token_secret;
        if (map.proxmox_node) this.defaultNode = map.proxmox_node;
        if (map.proxmox_storage) this.defaultStorage = map.proxmox_storage;
      } catch {
        this.logger.warn('Could not read Proxmox settings from DB — using env defaults');
      }
    }

    const baseURL = this.host
      ? `https://${this.host}/api2/json`
      : 'http://localhost:8006/api2/json';

    this.client.defaults.baseURL = baseURL;
    this.initialized = false;

    if (this.host && this.tokenId && this.tokenSecret) {
      this.client.defaults.headers.common.Authorization = `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`;
      this.initialized = true;
      this.logger.log(`Proxmox service configured for host ${this.host}`);
    } else {
      delete this.client.defaults.headers.common.Authorization;
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
    const { data } = await this.client.post<{ data: T }>(path, body ?? {});
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
    const storage = options.storage ?? this.defaultStorage;
    const body: Record<string, unknown> = {
      vmid: options.vmid,
      name: options.name,
      cores: options.cores,
      memory: options.memory,
      ostype: 'l26',
      net0: options.net ?? 'virtio,bridge=vmbr0',
      storage,
      virtio0: `${storage}:${options.disk}`,
    };

    if (options.iso) {
      body.ide2 = `local:iso/${options.iso},media=cdrom`;
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

  async getVmRrdData(
    vmid: number,
    timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' = 'hour',
    node: string = this.defaultNode,
  ): Promise<unknown[]> {
    return this.get<unknown[]>(`/nodes/${node}/qemu/${vmid}/rrddata?timeframe=${timeframe}`);
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

  async backupVm(
    vmid: number,
    options?: {
      storage?: string;
      mode?: 'snapshot' | 'suspend' | 'stop';
      compress?: 'lzo' | 'gzip' | 'zstd';
    },
    node: string = this.defaultNode,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      vmid,
      mode: options?.mode ?? 'snapshot',
    };
    if (options?.storage) body.storage = options.storage;
    if (options?.compress) body.compress = options.compress;
    return this.post<string>(`/nodes/${node}/vzdump`, body);
  }

  async restoreVmBackup(
    vmid: number,
    archive: string,
    options?: { storage?: string; force?: boolean },
    node: string = this.defaultNode,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      vmid,
      archive,
      force: options?.force ?? 1,
    };
    if (options?.storage) body.storage = options.storage;
    return this.post<string>(`/nodes/${node}/vzdump/restore`, body);
  }

  async updateVmConfig(
    vmid: number,
    config: Record<string, unknown>,
    node: string = this.defaultNode,
  ): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/config`, config);
  }

  async setVmTags(
    vmid: number,
    tags: string[],
    node: string = this.defaultNode,
  ): Promise<string> {
    return this.updateVmConfig(vmid, { tags: tags.join(' ') }, node);
  }

  async getVmTags(vmid: number, node: string = this.defaultNode): Promise<string[]> {
    const config = await this.getVmConfig(node, vmid);
    const tags = (config.tags as string) ?? '';
    return tags ? tags.split(/\s+/).filter(Boolean) : [];
  }

  async getFirewallRules(node: string, vmid: number): Promise<unknown[]> {
    return this.get<unknown[]>(`/nodes/${node}/qemu/${vmid}/firewall/rules`);
  }

  async addFirewallRule(node: string, vmid: number, rule: Record<string, unknown>): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/firewall/rules`, rule);
  }

  async deleteFirewallRule(node: string, vmid: number, pos: number): Promise<string> {
    return this.del<string>(`/nodes/${node}/qemu/${vmid}/firewall/rules/${pos}`);
  }

  async getManagedVms(node: string = this.defaultNode): Promise<ProxmoxVm[]> {
    const vms = await this.getVms(node);
    const managed: ProxmoxVm[] = [];
    for (const vm of vms) {
      try {
        const tags = await this.getVmTags(vm.vmid, node);
        if (tags.includes(CLOUDNEST_MANAGED_TAG)) {
          managed.push(vm);
        }
      } catch {
        // Skip VMs whose config can't be read
      }
    }
    return managed;
  }

  async assertVmManaged(vmid: number, node: string = this.defaultNode): Promise<void> {
    const tags = await this.getVmTags(vmid, node);
    if (!tags.includes(CLOUDNEST_MANAGED_TAG)) {
      throw new Error(`VM ${vmid} is not managed by CloudNest (missing tag "${CLOUDNEST_MANAGED_TAG}")`);
    }
  }

  async resizeDisk(
    vmid: number,
    disk: string,
    sizeGb: number,
    node: string = this.defaultNode,
  ): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/resize`, {
      disk,
      size: `${sizeGb}G`,
    });
  }

  async migrateVm(
    vmid: number,
    targetNode: string,
    options?: { online?: boolean },
    node: string = this.defaultNode,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      target: targetNode,
    };
    if (options?.online !== undefined) body.online = options.online;
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/migrate`, body);
  }

  async downloadUrl(
    sourceUrl: string,
    storage: string,
    node: string = this.defaultNode,
  ): Promise<string> {
    return this.post<string>(`/nodes/${node}/storage/${storage}/download-url`, {
      url: sourceUrl,
    });
  }

  async getCurrentIso(
    vmid: number,
    node: string = this.defaultNode,
  ): Promise<{ iso: string; storage: string } | null> {
    const config = await this.getVmConfig(node, vmid);
    if (!config.ide2) return null;
    const match = String(config.ide2).match(/^(.*?):iso\/(.*?),media=cdrom/);
    if (!match) return null;
    return { storage: match[1], iso: match[2] };
  }

  async mountIso(
    vmid: number,
    iso: string,
    options?: { storage?: string },
    node: string = this.defaultNode,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      ide2: `${options?.storage ?? 'local'}:iso/${iso},media=cdrom`,
    };
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/config`, body);
  }

  async ejectIso(
    vmid: number,
    node: string = this.defaultNode,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      ide2: 'none,media=cdrom',
    };
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/config`, body);
  }

  async rollbackSnapshot(
    vmid: number,
    snapname: string,
    node: string = this.defaultNode,
  ): Promise<string> {
    return this.post<string>(`/nodes/${node}/qemu/${vmid}/snapshot/${snapname}/rollback`);
  }
}
