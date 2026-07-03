'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { ArrowLeft, Play, Square, RefreshCw, Terminal, Trash2 } from 'lucide-react';
import Link from 'next/link';
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

export default function VmDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: vm, error, mutate } = useSWR(`/vms/${params.id}`, fetcher);
  const { data: estimate } = useSWR(`/billing/estimate/${params.id}`, fetcher);
  const [actionVm, setActionVm] = useState(false);

  if (error?.response?.status === 404) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">VM not found</h2>
        <Link href="/dashboard/vms" className="text-blue-600 hover:text-blue-500 mt-2 inline-block">Back to VMs</Link>
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const handleAction = async (action: string) => {
    setActionVm(true);
    try {
      await api.post(`/vms/${vm.id}/action`, { action });
      toast.success(`${action} command sent`);
      setTimeout(() => mutate(), 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActionVm(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this VM? This cannot be undone.')) return;
    setActionVm(true);
    try {
      await api.delete(`/vms/${vm.id}`);
      toast.success('VM deleted');
      router.push('/dashboard/vms');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setActionVm(false);
    }
  };

  const handleConsole = async () => {
    try {
      const { data } = await api.get(`/vms/${vm.id}/console`);
      window.open(data.url, '_blank');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Console unavailable');
    }
  };

  const actions = [];
  if (vm.status === 'stopped') actions.push({ label: 'Start', action: 'start', icon: Play, color: 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' });
  if (vm.status === 'running') {
    actions.push({ label: 'Stop', action: 'stop', icon: Square, color: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' });
    actions.push({ label: 'Restart', action: 'restart', icon: RefreshCw, color: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20' });
  }

  return (
    <div>
      <Link href="/dashboard/vms" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to VMs
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{vm.name || `VM #${vm.vmid}`}</h1>
          <span className={cn('text-xs px-2 py-1 rounded-full mt-2 inline-block', statusColors[vm.status] || statusColors.error)}>
            {vm.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {actions.map(({ label, action, icon: Icon, color }) => (
            <button
              key={action}
              onClick={() => handleAction(action)}
              disabled={actionVm}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 transition-colors', color)}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          {vm.status === 'running' && (
            <button
              onClick={handleConsole}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Terminal className="h-4 w-4" /> Console
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={actionVm}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Resources</h2>
          <div className="space-y-3">
            {[
              { label: 'CPU', value: `${vm.cpuCores} cores` },
              { label: 'Memory', value: `${vm.memoryMb} MB` },
              { label: 'Disk', value: `${vm.diskGb} GB` },
              { label: 'VM ID', value: `#${vm.vmid}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Billing</h2>
          {estimate ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-sm text-slate-500">Hourly rate</span>
                <span className="text-sm font-medium">${(estimate.hourlyRate / 100).toFixed(4)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-sm text-slate-500">Est. daily</span>
                <span className="text-sm font-medium">${(estimate.dailyCost / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-slate-500">Est. monthly</span>
                <span className="text-sm font-medium">${(estimate.monthlyCost / 100).toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No billing data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
