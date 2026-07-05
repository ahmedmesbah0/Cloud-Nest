'use client';

import Link from 'next/link';
import { Server, Play, Square, RefreshCw, Cpu, Monitor, HardDrive, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig = {
  running: { label: 'Running', dot: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  stopped: { label: 'Stopped', dot: 'bg-slate-400', bg: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
  provisioning: { label: 'Provisioning', dot: 'bg-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  suspended: { label: 'Suspended', dot: 'bg-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  error: { label: 'Error', dot: 'bg-red-500', bg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};

interface VmCardProps {
  vm: {
    id: string;
    vmid?: number;
    name?: string;
    status: string;
    cpuCores?: number;
    memoryMb?: number;
    diskGb?: number;
  };
  onAction?: (vmId: string, action: string) => void;
  actionLoading?: string | null;
}

export function VmCard({ vm, onAction, actionLoading }: VmCardProps) {
  const cfg = statusConfig[vm.status as keyof typeof statusConfig] || statusConfig.error;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center')}>
            <Server className="h-5 w-5 text-slate-500" />
          </div>
          <div className="min-w-0">
            <Link href={`/dashboard/vms/${vm.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:text-primary truncate block">
              {vm.name || `VM #${vm.vmid}`}
            </Link>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
              <span className="text-xs text-slate-500">{cfg.label}</span>
            </div>
          </div>
        </div>
        {onAction && (
          <div className="flex items-center gap-0.5">
            {vm.status === 'stopped' && (
              <button onClick={() => onAction(vm.id, 'start')} disabled={actionLoading === vm.id} className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded" title="Start">
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
            {vm.status === 'running' && (
              <>
                <button onClick={() => onAction(vm.id, 'stop')} disabled={actionLoading === vm.id} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Stop">
                  <Square className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onAction(vm.id, 'restart')} disabled={actionLoading === vm.id} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded" title="Restart">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg py-2">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
          <p className="text-xs font-medium text-foreground">{vm.cpuCores || 0}</p>
          <p className="text-[10px] text-muted-foreground">Cores</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg py-2">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
          <p className="text-xs font-medium text-foreground">{vm.memoryMb || 0} MB</p>
          <p className="text-[10px] text-muted-foreground">RAM</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg py-2">
          <HardDrive className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
          <p className="text-xs font-medium text-foreground">{vm.diskGb || 0} GB</p>
          <p className="text-[10px] text-muted-foreground">Disk</p>
        </div>
      </div>
      <Link
        href={`/dashboard/vms/${vm.id}`}
        className="mt-4 flex items-center justify-center gap-1.5 w-full text-sm text-primary hover:text-primary/80 border border-border rounded-lg py-2 transition-colors"
      >
        Manage <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
