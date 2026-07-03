import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: '/vm-status',
  cors: { origin: '*', credentials: true },
})
export class VmGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VmGateway.name);
  private userSockets = new Map<string, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token as string, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      const userId = payload.sub as string;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.data.userId = userId;
      client.join(`user:${userId}`);

      this.logger.log(`User ${userId} connected to VM status gateway (socket ${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Socket ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe-vm')
  handleSubscribeVm(client: Socket, vmId: string) {
    const userId = client.data.userId as string;
    if (!userId) return;
    client.join(`vm:${vmId}`);
    this.logger.log(`User ${userId} subscribed to VM ${vmId}`);
  }

  @SubscribeMessage('unsubscribe-vm')
  handleUnsubscribeVm(client: Socket, vmId: string) {
    const userId = client.data.userId as string;
    if (!userId) return;
    client.leave(`vm:${vmId}`);
  }

  emitVmStatusUpdate(vmId: string, status: string, metadata?: Record<string, unknown>) {
    this.server.to(`vm:${vmId}`).emit('vm-status', {
      vmId,
      status,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  emitUserNotification(userId: string, event: string, data: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}
