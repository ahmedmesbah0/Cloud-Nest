'use client';

import useSWR from 'swr';
import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Plus, Server, RefreshCw, Play, Square, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusColors: Record<string, string> = {
  running: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  stopped: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  provisioning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  suspended: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

export default function VmsPage() {
  const { data, mutate } = useSWR('/vms', fetcher);
  const [actionVm, setActionVm] = useState<string | null>(null);

  const vms = data?.filter?.((v: any) => v.status !== 'deleted') || [];

  const handleAction = async (vmId: string, action: string) => {
    setActionVm(vmId);
    try {
      await api.post(`/vms/${vmId}/action`, { action });
      toast.success(`${action} command sent`);
      setTimeout(() => mutate(), 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActionVm(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Virtual Machines</h1>
        <Link
          href="/dashboard/vms/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> New VM
        </Link>
      </div>

      {vms.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center">
          <Server className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No VMs yet</h2>
          <p className="text-slate-500 mb-6">Create your first virtual machine to get started.</p>
          <Link
            href="/dashboard/vms/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> Create VM
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {vms.map((vm: any) => (
            <div
              key={vm.id}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    vm.status === 'running' ? 'bg-green-50 dark:bg-green-900/20' :
                    vm.status === 'provisioning' ? 'bg-blue-50 dark:bg-blue-900/20' :
                    'bg-slate-50 dark:bg-slate-700',
                  )}>
                    <Server className={cn(
                      'h-5 w-5',
                      vm.status === 'running' ? 'text-green-500' :
                      vm.status === 'provisioning' ? 'text-blue-500' :
                      'text-slate-400',
                    )} />
                  </div>
                  <div>
                    <Link href={`/dashboard/vms/${vm.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
                      {vm.name || `VM #${vm.vmid}`}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {vm.cpuCores} cores &middot; {vm.memoryMb} MB RAM &middot; {vm.diskGb} GB SSD
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={cn('text-xs px-2 py-1 rounded-full', statusColors[vm.status] || statusColors.error)}>
                    {vm.status}
                  </span>

                  <div className="flex items-center gap-1">
                    {vm.status === 'stopped' && (
                      <button
                        onClick={() => handleAction(vm.id, 'start')}
                        disabled={actionVm === vm.id}
                        className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                        title="Start"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    )}
                    {vm.status === 'running' && (
                      <>
                        <button
                          onClick={() => handleAction(vm.id, 'stop')}
                          disabled={actionVm === vm.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Stop"
                        >
                          <Square className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleAction(vm.id, 'restart')}
                          disabled={actionVm === vm.id}
                          className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded"
                          title="Restart"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>

                  <Link
                    href={`/dashboard/vms/${vm.id}`}
                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700"
                  >
                    Details <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
