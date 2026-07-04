'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useState, useCallback } from 'react';
import api from '@/lib/api';
import { ArrowLeft, Play, Square, RefreshCw, Terminal, Trash2, Maximize2, RotateCcw, Disc } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useVmSocket } from '@/hooks/useVmSocket';

type VmStatusUpdate = { vmId: string; status: string; ipAddress?: string };
type UserNotification = { type: string; message: string };

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusColors: Record<string, string> = {
  running: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  stopped: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  provisioning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  suspended: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  deleted: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

export default function VmDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: vm, error, mutate } = useSWR(`/vms/${params.id}`, fetcher, { refreshInterval: 0 });
  const { data: templates } = useSWR('/vms/templates', fetcher);
  const { data: estimate } = useSWR(`/billing/estimate/${params.id}`, fetcher);
  const [actionVm, setActionVm] = useState(false);

  const [showResize, setShowResize] = useState(false);
  const [showReinstall, setShowReinstall] = useState(false);
  const [showIso, setShowIso] = useState(false);

  const [resizeForm, setResizeForm] = useState({ cpuCores: 0, memoryMb: 0, diskGb: 0 });
  const [reinstallTemplateId, setReinstallTemplateId] = useState('');
  const [isoForm, setIsoForm] = useState({ iso: '', storage: 'local-lvm' });

  useVmSocket(
    params.id as string,
    useCallback((update: VmStatusUpdate) => {
      mutate(update, { revalidate: false });
    }, [mutate]),
    useCallback((notif: UserNotification) => {
      if (notif.type === 'error') toast.error(notif.message);
      else if (notif.type === 'success') toast.success(notif.message);
      else toast(notif.message);
    }, []),
  );

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
      await api.get(`/vms/${vm.id}/console`);
      window.open(`/vm-console/${vm.id}`, '_blank');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Console unavailable');
    }
  };

  const handleResize = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionVm(true);
    try {
      await api.post(`/vms/${vm.id}/resize`, resizeForm);
      toast.success('Resize queued');
      setShowResize(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Resize failed');
    } finally {
      setActionVm(false);
    }
  };

  const handleReinstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reinstallTemplateId) {
      toast.error('Please select a template');
      return;
    }
    if (!confirm('Reinstall will wipe all data on this VM. Continue?')) return;
    setActionVm(true);
    try {
      await api.post(`/vms/${vm.id}/reinstall`, { templateId: reinstallTemplateId });
      toast.success('Reinstall queued');
      setShowReinstall(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Reinstall failed');
    } finally {
      setActionVm(false);
    }
  };

  const handleMountIso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isoForm.iso) {
      toast.error('Please enter an ISO filename');
      return;
    }
    setActionVm(true);
    try {
      await api.post(`/vms/${vm.id}/mount-iso`, isoForm);
      toast.success('ISO mount queued');
      setShowIso(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Mount ISO failed');
    } finally {
      setActionVm(false);
    }
  };

  const handleEjectIso = async () => {
    setActionVm(true);
    try {
      await api.post(`/vms/${vm.id}/eject-iso`);
      toast.success('ISO eject queued');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Eject ISO failed');
    } finally {
      setActionVm(false);
    }
  };

  const actions = [];
  if (vm.status === 'stopped') actions.push({ label: 'Start', action: 'start', icon: Play, color: 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' });
  if (vm.status === 'running') {
    actions.push({ label: 'Stop', action: 'stop', icon: Square, color: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' });
    actions.push({ label: 'Restart', action: 'restart', icon: RefreshCw, color: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20' });
  }

  const isProvisioning = vm.status === 'provisioning';

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
              disabled={actionVm || isProvisioning}
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
            disabled={actionVm || isProvisioning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Resources</h2>
          <div className="space-y-3">
            {[
              { label: 'CPU', value: `${vm.cpuCores} cores` },
              { label: 'Memory', value: `${vm.memoryMb} MB` },
              { label: 'Disk', value: `${vm.diskGb} GB` },
              { label: 'VM ID', value: `#${vm.vmid}` },
              ...(vm.ipAddress ? [{ label: 'IP Address', value: vm.ipAddress }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setResizeForm({ cpuCores: vm.cpuCores, memoryMb: vm.memoryMb, diskGb: vm.diskGb }); setShowResize(true); }}
              disabled={isProvisioning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <Maximize2 className="h-4 w-4" /> Resize
            </button>
            <button
              onClick={() => setShowReinstall(true)}
              disabled={isProvisioning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Reinstall
            </button>
            <button
              onClick={() => setShowIso(true)}
              disabled={isProvisioning || vm.status !== 'stopped'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <Disc className="h-4 w-4" /> Mount ISO
            </button>
            {vm.status === 'stopped' && (
              <button
                onClick={handleEjectIso}
                disabled={actionVm}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Disc className="h-4 w-4" /> Eject ISO
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
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

      {/* Resize Modal */}
      {showResize && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Resize VM</h3>
            <form onSubmit={handleResize} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CPU Cores</label>
                <input type="number" value={resizeForm.cpuCores} onChange={(e) => setResizeForm({ ...resizeForm, cpuCores: parseInt(e.target.value) || 1 })} min={1} max={32} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">RAM (MB)</label>
                <input type="number" value={resizeForm.memoryMb} onChange={(e) => setResizeForm({ ...resizeForm, memoryMb: parseInt(e.target.value) || 512 })} min={512} max={131072} step={512} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disk (GB)</label>
                <input type="number" value={resizeForm.diskGb} onChange={(e) => setResizeForm({ ...resizeForm, diskGb: parseInt(e.target.value) || 5 })} min={5} max={1000} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowResize(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={actionVm} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Resize</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reinstall Modal */}
      {showReinstall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Reinstall OS</h3>
            <p className="text-sm text-slate-500 mb-4">This will wipe all data on the VM and reinstall from a template.</p>
            <form onSubmit={handleReinstall} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Template</label>
                <select value={reinstallTemplateId} onChange={(e) => setReinstallTemplateId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                  <option value="">Select template...</option>
                  {(templates || []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.osType})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowReinstall(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={actionVm} className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">Reinstall</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mount ISO Modal */}
      {showIso && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Mount ISO</h3>
            <form onSubmit={handleMountIso} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ISO Filename</label>
                <input type="text" value={isoForm.iso} onChange={(e) => setIsoForm({ ...isoForm, iso: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="ubuntu-24.04.iso" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Storage (optional)</label>
                <input type="text" value={isoForm.storage} onChange={(e) => setIsoForm({ ...isoForm, storage: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="local-lvm" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowIso(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={actionVm} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Mount ISO</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
