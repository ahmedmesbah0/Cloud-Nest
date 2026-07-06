'use client';

import useSWR from 'swr';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Plus, Server, RefreshCw, Play, Square, ArrowUpDown, Cpu, HardDrive, Monitor, ExternalLink, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import ViewToggle from '@/components/view-toggle';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusConfig = {
  running: { label: 'Running', dot: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  stopped: { label: 'Stopped', dot: 'bg-slate-400', bg: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
  provisioning: { label: 'Provisioning', dot: 'bg-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  suspended: { label: 'Suspended', dot: 'bg-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  error: { label: 'Error', dot: 'bg-red-500', bg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};

type SortKey = 'name' | 'status' | 'createdAt';

export default function VmsPage() {
  const { data, mutate } = useSWR('/vms', fetcher);
  const [actionVm, setActionVm] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  const vms = useMemo(() => {
    const list = data?.filter?.((v: any) => v.status !== 'deleted') || [];
    return list
      .filter((vm: any) =>
        (vm.name || `VM #${vm.vmid}`).toLowerCase().includes(search.toLowerCase()) ||
        vm.status?.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a: any, b: any) => {
        if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
        if (sort === 'status') return (a.status || '').localeCompare(b.status || '');
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [data, search, sort]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Virtual Machines</h1>
        <Link
          href="/dashboard/vms/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" /> New VM
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or status..."
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle onToggle={(mode) => setView(mode)} />
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="createdAt">Newest</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {vms.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center">
          <Server className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {search ? 'No matching VMs' : 'No VMs yet'}
          </h2>
          <p className="text-slate-500 mb-6">
            {search ? 'Try a different search term.' : 'Create your first virtual machine to get started.'}
          </p>
          {!search && (
            <Link
              href="/dashboard/vms/new"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" /> Create VM
            </Link>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vms.map((vm: any) => {
            const cfg = statusConfig[vm.status as keyof typeof statusConfig] || statusConfig.error;
            return (
              <div
                key={vm.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', cfg.bg.split(' ')[0] + ' ' + cfg.bg.split(' ')[1])}>
                      <Server className="h-5 w-5" style={{ color: cfg.dot.replace('bg-', '').replace('500', '500') }} />
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
                  <div className="flex items-center gap-0.5">
                    {vm.status === 'stopped' && (
                      <button onClick={() => handleAction(vm.id, 'start')} disabled={actionVm === vm.id} className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded" title="Start">
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {vm.status === 'running' && (
                      <>
                        <button onClick={() => handleAction(vm.id, 'stop')} disabled={actionVm === vm.id} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Stop">
                          <Square className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleAction(vm.id, 'restart')} disabled={actionVm === vm.id} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded" title="Restart">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
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
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-200 dark:divide-slate-700">
          {vms.map((vm: any) => {
            const cfg = statusConfig[vm.status as keyof typeof statusConfig] || statusConfig.error;
            return (
              <div key={vm.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                  <div className="min-w-0">
                    <Link href={`/dashboard/vms/${vm.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:text-primary truncate block">
                      {vm.name || `VM #${vm.vmid}`}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {vm.cpuCores} cores &middot; {vm.memoryMb} MB RAM &middot; {vm.diskGb} GB SSD
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs px-2 py-1 rounded-full', cfg.bg)}>{cfg.label}</span>
                  <div className="flex items-center gap-1">
                    {vm.status === 'stopped' && (
                      <button onClick={() => handleAction(vm.id, 'start')} disabled={actionVm === vm.id} className="p-1.5 text-slate-400 hover:text-green-500 rounded" title="Start">
                        <Play className="h-4 w-4" />
                      </button>
                    )}
                    {vm.status === 'running' && (
                      <>
                        <button onClick={() => handleAction(vm.id, 'stop')} disabled={actionVm === vm.id} className="p-1.5 text-slate-400 hover:text-red-500 rounded" title="Stop">
                          <Square className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleAction(vm.id, 'restart')} disabled={actionVm === vm.id} className="p-1.5 text-slate-400 hover:text-amber-500 rounded" title="Restart">
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                  <Link href={`/dashboard/vms/${vm.id}`} className="text-sm text-primary hover:text-primary/80">
                    Details &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
