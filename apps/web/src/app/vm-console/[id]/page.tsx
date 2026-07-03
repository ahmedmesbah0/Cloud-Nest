'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

export default function VmConsolePage() {
  const params = useParams();
  const [status, setStatus] = useState('connecting');
  const [vncUrl, setVncUrl] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const retryCount = useRef(0);

  const connect = async () => {
    setStatus('connecting');
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/vms/${params.id}/console`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (!res.ok) throw new Error('Console unavailable');
      const data = await res.json();
      setVncUrl(data.url);
      setStatus('connected');
    } catch {
      if (retryCount.current < 3) {
        retryCount.current++;
        setTimeout(connect, 2000);
      } else {
        setStatus('error');
      }
    }
  };

  useEffect(() => {
    connect();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900">
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
          {status === 'error' && <span className="text-xs text-red-400">Connection failed</span>}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center h-[calc(100vh-48px)]">
        {status === 'connected' && vncUrl ? (
          <iframe
            ref={iframeRef}
            src={vncUrl}
            className="w-full h-full"
            title="VM Console"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : (
          <div className="text-center">
            <p className="text-slate-400">
              {status === 'connecting' ? 'Establishing console connection...' : 'Console unavailable'}
            </p>
            {status === 'error' && (
              <button
                onClick={connect}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
