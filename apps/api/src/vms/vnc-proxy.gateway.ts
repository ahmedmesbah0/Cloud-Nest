import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { VmService } from './vm.service';
import WebSocket from 'ws';

interface VncProxyState {
  userSocket: Socket;
  vmId: string;
  userId: string;
  proxmoxWs: WebSocket | null;
}

@WebSocketGateway({ namespace: '/vnc-proxy' })
export class VncProxyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(VncProxyGateway.name);
  private proxies = new Map<string, VncProxyState>();

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly proxmox: ProxmoxService,
    private readonly vmService: VmService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token || client.handshake.query?.token) as string | undefined;
      if (!token) { client.disconnect(); return; }
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
      client.data.userId = payload.sub;
    } catch {
      client.disconnect();
      return;
    }

    const vmId = client.handshake.query.vmId as string;
    const userId = client.data.userId as string;

    if (!vmId || !userId) {
      client.emit('error', 'Missing vmId or auth');
      client.disconnect();
      return;
    }

    let vm: { proxmoxId: number | null };
    try {
      vm = await this.vmService.getVm(vmId, userId);
    } catch {
      client.emit('error', 'VM not found or not yours');
      client.disconnect();
      return;
    }

    try {
      const vncInfo = await this.proxmox.getVncTicket(vm.proxmoxId!);
      const host = process.env.PROXMOX_HOST || '172.16.1.10';
      const wsUrl = `wss://${host}:${vncInfo.port}/?token=${vncInfo.ticket}`;

      const proxmoxWs = new WebSocket(wsUrl, { rejectUnauthorized: false });

      proxmoxWs.on('open', () => {
        this.logger.log(`VNC proxy open for VM ${vmId}`);
        client.emit('connected');
      });

      proxmoxWs.on('message', (data: WebSocket.RawData) => {
        if (client.connected) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          client.emit('data', buf);
        }
      });

      proxmoxWs.on('error', (err: Error) => {
        this.logger.error(`VNC proxy error for VM ${vmId}: ${err.message}`);
        client.emit('error', 'VNC connection failed');
        client.disconnect();
      });

      proxmoxWs.on('close', () => {
        client.emit('disconnected');
        if (client.connected) client.disconnect();
      });

      this.proxies.set(client.id, { userSocket: client, vmId, userId, proxmoxWs });
    } catch (err: any) {
      this.logger.error(`VNC proxy setup failed: ${err.message}`);
      client.emit('error', 'Failed to establish VNC connection');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const state = this.proxies.get(client.id);
    if (state?.proxmoxWs) {
      try { state.proxmoxWs.close(); } catch { /* ignore */ }
    }
    this.proxies.delete(client.id);
  }

  @SubscribeMessage('data')
  handleData(client: Socket, payload: ArrayBuffer | Buffer) {
    const state = this.proxies.get(client.id);
    if (state?.proxmoxWs && state.proxmoxWs.readyState === WebSocket.OPEN) {
      state.proxmoxWs.send(payload);
    }
  }

  @SubscribeMessage('disconnect')
  handleProxyDisconnect(client: Socket) {
    const state = this.proxies.get(client.id);
    if (state?.proxmoxWs) {
      try { state.proxmoxWs.close(); } catch { /* ignore */ }
    }
    this.proxies.delete(client.id);
  }
}
