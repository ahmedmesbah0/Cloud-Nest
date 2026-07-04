'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api';

type VmStatusUpdate = {
  vmId: string;
  status: string;
  ipAddress?: string;
};

type UserNotification = {
  type: 'success' | 'error' | 'info';
  message: string;
};

export function useVmSocket(
  vmId: string,
  onStatusUpdate?: (data: VmStatusUpdate) => void,
  onNotification?: (data: UserNotification) => void,
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

    const socket = io(`${socketUrl}/vm-status`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('subscribe-vm', vmId);
    });

    socket.on('vm-status', (data: VmStatusUpdate) => {
      if (onStatusUpdate) onStatusUpdate(data);
    });

    socket.on('vm-notification', (data: { message: string; type?: string }) => {
      if (onNotification) {
        onNotification({
          type: (data.type as any) || 'info',
          message: data.message,
        });
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [vmId, onStatusUpdate, onNotification]);

  return socketRef;
}
