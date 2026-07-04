'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api';

export default function VmConsolePage() {
  const params = useParams();
  const [status, setStatus] = useState('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const connect = async () => {
    setStatus('connecting');
    setErrorMsg('');
    const token = getAccessToken();
    if (!token) {
      setStatus('error');
      setErrorMsg('Not authenticated');
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';
    const socket = io(`${wsUrl}/vnc-proxy`, {
      auth: { token },
      query: { vmId: params.id },
      transports: ['websocket'],
    });

    socket.on('connected', () => {
      setStatus('connected');
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 1024, 768);
      }
    });

    socket.on('data', (data: ArrayBuffer) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !canvasRef.current) return;
      const blob = new Blob([data], { type: 'image/png' });
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      const url = URL.createObjectURL(blob);
      img.src = url;
    });

    socket.on('error', (msg: string) => {
      setStatus('error');
      setErrorMsg(msg);
    });

    socket.on('disconnect', () => {
      setStatus('error');
      setErrorMsg('Disconnected');
    });

    socketRef.current = socket;
  };

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [params.id]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex items-center justify-between h-12 px-4 bg-slate-800 border-b border-slate-700">
        <span className="text-sm text-slate-300">VM Console - #{params.id}</span>
        <div className="flex items-center gap-2">
          {status === 'connecting' && (
            <span className="text-xs text-slate-400 flex items-center gap-2">
              <div className="animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full" />
              Connecting...
            </span>
          )}
          {status === 'connected' && <span className="text-xs text-green-400">Connected</span>}
          {status === 'error' && <span className="text-xs text-red-400">{errorMsg || 'Connection failed'}</span>}
          <button
            onClick={connect}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-600"
          >
            Reconnect
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-black">
        <canvas ref={canvasRef} width={1024} height={768} className="max-w-full max-h-full" />
      </div>
    </div>
  );
}
