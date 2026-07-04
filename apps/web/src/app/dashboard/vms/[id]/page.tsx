'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useState, useCallback } from 'react';
import api from '@/lib/api';
import { ArrowLeft, Play, Square, RefreshCw, Terminal, Trash2, Maximize2, RotateCcw, Disc, Camera, HardDrive, Trash, Cpu, Wifi, Globe } from 'lucide-react';
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

const backupStatusColors: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
  running: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  completed: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  failed: 'text-red-600 bg-red-50 dark:bg-red-900/20',
};

const snapshotStatusColors: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
  created: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  failed: 'text-red-600 bg-red-50 dark:bg-red-900/20',
};

export default function VmDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: vm, error, mutate } = useSWR(`/vms/${params.id}`, fetcher, { refreshInterval: 0 });
  const { data: templates } = useSWR('/vms/templates', fetcher);
  const { data: estimate } = useSWR(`/billing/estimate/${params.id}`, fetcher);
  const { data: backups, mutate: mutateBackups } = useSWR(`/vms/${params.id}/backups`, fetcher);
  const { data: snapshots, mutate: mutateSnapshots } = useSWR(`/vms/${params.id}/snapshots`, fetcher);
  const { data: metrics, mutate: mutateMetrics } = useSWR(
    () => vm?.status === 'running' ? `/vms/${params.id}/metrics?timeframe=hour` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
  const [actionVm, setActionVm] = useState(false);

  const [showResize, setShowResize] = useState(false);
  const [showReinstall, setShowReinstall] = useState(false);
  const [showIso, setShowIso] = useState(false);
  const [showHardware, setShowHardware] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [showDns, setShowDns] = useState(false);

  const [resizeForm, setResizeForm] = useState({ cpuCores: 0, memoryMb: 0, diskGb: 0 });
  const [reinstallTemplateId, setReinstallTemplateId] = useState('');
  const [isoForm, setIsoForm] = useState({ iso: '', storage: 'local-lvm' });
  const [isoStorages, setIsoStorages] = useState<any[]>([]);
  const [isoList, setIsoList] = useState<any[]>([]);
  const [currentIso, setCurrentIso] = useState<{ iso: string; storage: string } | null>(null);
  const [selectedIsoStorage, setSelectedIsoStorage] = useState('local');
  const [loadingIsoList, setLoadingIsoList] = useState(false);
  const [isoDownloadUrl, setIsoDownloadUrl] = useState('');
  const [isoDownloadStorage, setIsoDownloadStorage] = useState('local');
  const [savingIsoDownload, setSavingIsoDownload] = useState(false);
  const [mountingIso, setMountingIso] = useState(false);
  const [hardwareForm, setHardwareForm] = useState<Record<string, any>>({});
  const [savingHardware, setSavingHardware] = useState(false);
  const [loadingHardware, setLoadingHardware] = useState(false);

  const [networkInterfaces, setNetworkInterfaces] = useState<Record<string, string>>({});
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [networkNewKey, setNetworkNewKey] = useState('');
  const [networkNewValue, setNetworkNewValue] = useState('');

  const [dnsForm, setDnsForm] = useState<{ nameserver1: string; nameserver2: string; searchdomain: string }>({ nameserver1: '', nameserver2: '', searchdomain: '' });
  const [loadingDns, setLoadingDns] = useState(false);
  const [savingDns, setSavingDns] = useState(false);

  const [reinstalling, setReinstalling] = useState(false);
  const [reinstallProgress, setReinstallProgress] = useState('');

  const [showCreateSnapshot, setShowCreateSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDescription, setSnapshotDescription] = useState('');
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [createBacking, setCreateBacking] = useState(false);
  const [backupMode, setBackupMode] = useState<'snapshot' | 'suspend' | 'stop'>('snapshot');

  const [selectedTimeframe, setSelectedTimeframe] = useState<'hour' | 'day' | 'week' | 'month' | 'year'>('hour');

  useVmSocket(
    params.id as string,
    useCallback((update: VmStatusUpdate) => {
      mutate(update, { revalidate: false });
      mutateMetrics();
    }, [mutate, mutateMetrics]),
    useCallback((notif: UserNotification) => {
      if (notif.type === 'error') toast.error(notif.message);
      else if (notif.type === 'success') toast.success(notif.message);
      else toast(notif.message);
      if (notif.type === 'backup-vm' || notif.type === 'create-snapshot' || notif.type === 'delete-snapshot') {
        mutateBackups();
        mutateSnapshots();
      }
    }, [mutateBackups, mutateSnapshots]),
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
    setShowReinstall(false);
    setReinstalling(true);
    setReinstallProgress('Queuing reinstall...');
    try {
      await api.post(`/vms/${vm.id}/reinstall`, { templateId: reinstallTemplateId });
      setReinstallProgress('Provisioning...');
      const poll = setInterval(async () => {
        try {
          const res = await api.get(`/vms/${vm.id}`);
          mutate(res.data, { revalidate: false });
          if (res.data.status !== 'provisioning') {
            clearInterval(poll);
            setReinstalling(false);
            if (res.data.status === 'error') toast.error('Reinstall failed');
            else toast.success('Reinstall complete');
          }
        } catch {
          clearInterval(poll);
          setReinstalling(false);
          toast.error('Failed to check reinstall status');
        }
      }, 5000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Reinstall failed');
      setReinstalling(false);
    }
  };

  const handleCancelReinstall = async () => {
    // no cancel possible — just dismiss overlay
    setReinstalling(false);
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

  const handleCreateBackup = async () => {
    setCreateBacking(true);
    try {
      await api.post(`/vms/${vm.id}/backups`, { mode: backupMode });
      toast.success('Backup queued');
      setTimeout(() => mutateBackups(), 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Backup failed');
    } finally {
      setCreateBacking(false);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm('Delete this backup?')) return;
    try {
      await api.delete(`/vms/${vm.id}/backups/${backupId}`);
      toast.success('Backup deleted');
      mutateBackups();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName) return;
    setCreatingSnapshot(true);
    try {
      const body: Record<string, string> = { name: snapshotName };
      if (snapshotDescription) body.description = snapshotDescription;
      await api.post(`/vms/${vm.id}/snapshots`, body);
      toast.success('Snapshot creation queued');
      setShowCreateSnapshot(false);
      setSnapshotName('');
      setSnapshotDescription('');
      setTimeout(() => mutateSnapshots(), 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Snapshot failed');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm('Delete this snapshot?')) return;
    try {
      await api.delete(`/vms/${vm.id}/snapshots/${snapshotId}`);
      toast.success('Snapshot deletion queued');
      setTimeout(() => mutateSnapshots(), 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleRollbackSnapshot = async (snapshotId: string, name: string) => {
    if (!confirm(`Rollback VM to snapshot "${name}"? This will stop the VM and revert its disk.`)) return;
    try {
      await api.post(`/vms/${vm.id}/snapshots/${snapshotId}/rollback`);
      toast.success('Snapshot rollback queued');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Rollback failed');
    }
  };

  const handleTimeframeChange = async (tf: 'hour' | 'day' | 'week' | 'month' | 'year') => {
    setSelectedTimeframe(tf);
    mutateMetrics();
  };

  const handleSaveHardware = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHardware(true);
    try {
      await api.put(`/vms/${vm.id}/hardware`, hardwareForm);
      toast.success('Hardware config updated. Reboot the VM for changes to take effect.');
      setShowHardware(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update hardware');
    } finally {
      setSavingHardware(false);
    }
  };

  const hardwareFields = [
    { key: 'bios', label: 'BIOS', placeholder: 'seabios / ovmf' },
    { key: 'boot', label: 'Boot Order', placeholder: 'order=ide2;virtio0;net0' },
    { key: 'machine', label: 'Machine Type', placeholder: 'pc / q35' },
    { key: 'cpu', label: 'CPU Type', placeholder: 'host / kvm64 / x86-64-v2-AES' },
    { key: 'sockets', label: 'CPU Sockets', type: 'number' },
    { key: 'ostype', label: 'OS Type', placeholder: 'l26 / win10 / other' },
    { key: 'agent', label: 'QEMU Agent', placeholder: '0 / 1' },
    { key: 'vga', label: 'VGA Type', placeholder: 'std / virtio / qxl' },
    { key: 'tablet', label: 'USB Tablet', placeholder: '0 / 1' },
    { key: 'hotplug', label: 'Hotplug', placeholder: 'disk,network,usb' },
    { key: 'acpi', label: 'ACPI', placeholder: '0 / 1' },
    { key: 'kvm', label: 'KVM', placeholder: '0 / 1' },
    { key: 'numa', label: 'NUMA', placeholder: '0 / 1' },
    { key: 'efidisk0', label: 'EFI Disk', placeholder: 'local:1,efitype=4m,pre-enrolled-keys=1' },
    { key: 'tpmstate0', label: 'TPM State', placeholder: 'local:1,version=v2.0' },
    { key: 'args', label: 'Custom Args', placeholder: '-device ...' },
  ];

  const actions = [];
  if (vm.status === 'stopped') actions.push({ label: 'Start', action: 'start', icon: Play, color: 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' });
  if (vm.status === 'running') {
    actions.push({ label: 'Stop', action: 'stop', icon: Square, color: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' });
    actions.push({ label: 'Restart', action: 'restart', icon: RefreshCw, color: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20' });
  }

  const isProvisioning = vm.status === 'provisioning';

  const chartData = (metrics || []).slice(-30);

  const maxCpu = Math.max(...chartData.map((d: any) => d.cpu || 0), 0.01);
  const maxMem = Math.max(...chartData.map((d: any) => d.mem || 0), 1);
  const maxNet = Math.max(...chartData.map((d: any) => Math.max(d.netin || 0, d.netout || 0)), 1);

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
              onClick={async () => {
                setLoadingHardware(true);
                setShowHardware(true);
                try {
                  const res = await api.get(`/vms/${vm.id}/hardware`);
                  setHardwareForm(res.data);
                } catch { setHardwareForm({}); }
                setLoadingHardware(false);
              }}
              disabled={isProvisioning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <Cpu className="h-4 w-4" /> Hardware
            </button>
            <button
              onClick={async () => {
                setLoadingNetwork(true);
                setShowNetwork(true);
                try {
                  const res = await api.get(`/vms/${vm.id}/network`);
                  setNetworkInterfaces(res.data);
                } catch { setNetworkInterfaces({}); }
                setLoadingNetwork(false);
              }}
              disabled={isProvisioning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <Wifi className="h-4 w-4" /> Network
            </button>
            <button
              onClick={async () => {
                setLoadingDns(true);
                setShowDns(true);
                try {
                  const res = await api.get(`/vms/${vm.id}/dns`);
                  setDnsForm({ nameserver1: res.data.nameserver1 || '', nameserver2: res.data.nameserver2 || '', searchdomain: res.data.searchdomain || '' });
                } catch { setDnsForm({ nameserver1: '', nameserver2: '', searchdomain: '' }); }
                setLoadingDns(false);
              }}
              disabled={isProvisioning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <Globe className="h-4 w-4" /> DNS
            </button>
            <button
              onClick={() => setShowReinstall(true)}
              disabled={isProvisioning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Reinstall
            </button>
            <button
              onClick={async () => {
                setShowIso(true);
                try {
                  const [storagesRes, currentRes] = await Promise.all([
                    api.get(`/vms/${vm.id}/iso/storages`),
                    api.get(`/vms/${vm.id}/iso/current`),
                  ]);
                  setIsoStorages(storagesRes.data);
                  setCurrentIso(currentRes.data);
                  if (storagesRes.data.length > 0) {
                    setSelectedIsoStorage(storagesRes.data[0].storage);
                  }
                } catch { /* backend may not support /iso/storages yet */ }
              }}
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

      {/* Monitoring Charts */}
      {vm.status === 'running' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Resource Usage</h2>
            <div className="flex gap-1">
              {(['hour', 'day', 'week', 'month', 'year'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  className={cn('px-2 py-1 text-xs rounded', selectedTimeframe === tf ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700')}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          {chartData.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {/* CPU Chart */}
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2">CPU</h3>
                <div className="h-24 flex items-end gap-[2px]">
                  {chartData.map((d: any, i: number) => (
                    <div
                      key={i}
                      className="flex-1 bg-blue-400 dark:bg-blue-500 rounded-t"
                      style={{ height: `${((d.cpu || 0) / maxCpu) * 100}%`, minHeight: '1px' }}
                      title={`${((d.cpu || 0) * 100).toFixed(1)}%`}
                    />
                  ))}
                </div>
              </div>
              {/* Memory Chart */}
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2">Memory (bytes)</h3>
                <div className="h-24 flex items-end gap-[2px]">
                  {chartData.map((d: any, i: number) => (
                    <div
                      key={i}
                      className="flex-1 bg-green-400 dark:bg-green-500 rounded-t"
                      style={{ height: `${((d.mem || 0) / maxMem) * 100}%`, minHeight: '1px' }}
                      title={`${((d.mem || 0) / 1024 / 1024).toFixed(0)} MB`}
                    />
                  ))}
                </div>
              </div>
              {/* Network In */}
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2">Network In (bytes/s)</h3>
                <div className="h-24 flex items-end gap-[2px]">
                  {chartData.map((d: any, i: number) => (
                    <div
                      key={i}
                      className="flex-1 bg-purple-400 dark:bg-purple-500 rounded-t"
                      style={{ height: `${((d.netin || 0) / maxNet) * 100}%`, minHeight: '1px' }}
                      title={`${((d.netin || 0) / 1024).toFixed(0)} KB/s`}
                    />
                  ))}
                </div>
              </div>
              {/* Network Out */}
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2">Network Out (bytes/s)</h3>
                <div className="h-24 flex items-end gap-[2px]">
                  {chartData.map((d: any, i: number) => (
                    <div
                      key={i}
                      className="flex-1 bg-amber-400 dark:bg-amber-500 rounded-t"
                      style={{ height: `${((d.netout || 0) / maxNet) * 100}%`, minHeight: '1px' }}
                      title={`${((d.netout || 0) / 1024).toFixed(0)} KB/s`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No metric data available yet. Data appears once the VM has been running for a few minutes.</p>
          )}
        </div>
      )}

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

      {/* Backups */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Backups</h2>
          <div className="flex items-center gap-2">
            <select
              value={backupMode}
              onChange={(e) => setBackupMode(e.target.value as any)}
              className="text-xs bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-slate-700 dark:text-slate-300"
            >
              <option value="snapshot">Snapshot mode</option>
              <option value="suspend">Suspend mode</option>
              <option value="stop">Stop mode</option>
            </select>
            <button
              onClick={handleCreateBackup}
              disabled={createBacking || isProvisioning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              <HardDrive className="h-4 w-4" /> {createBacking ? 'Queuing...' : 'Create Backup'}
            </button>
          </div>
        </div>
        {!backups || backups.length === 0 ? (
          <p className="text-sm text-slate-500">No backups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 text-slate-500 font-medium">Name</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Status</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Storage</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Size</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Created</th>
                  <th className="text-right py-2 text-slate-500 font-medium" />
                </tr>
              </thead>
              <tbody>
                {backups.map((b: any) => (
                  <tr key={b.id} className="border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <td className="py-2 text-slate-900 dark:text-white">{b.name}</td>
                    <td className="py-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', backupStatusColors[b.status] || '')}>{b.status}</span>
                    </td>
                    <td className="py-2 text-slate-500">{b.storage}</td>
                    <td className="py-2 text-slate-500">{b.sizeMb ? `${b.sizeMb} MB` : '-'}</td>
                    <td className="py-2 text-slate-500">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => handleDeleteBackup(b.id)} className="text-red-500 hover:text-red-700"><Trash className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Snapshots */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Snapshots</h2>
          <button
            onClick={() => setShowCreateSnapshot(true)}
            disabled={isProvisioning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            <Camera className="h-4 w-4" /> Create Snapshot
          </button>
        </div>
        {!snapshots || snapshots.length === 0 ? (
          <p className="text-sm text-slate-500">No snapshots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 text-slate-500 font-medium">Name</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Description</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Status</th>
                  <th className="text-left py-2 text-slate-500 font-medium">Created</th>
                  <th className="text-right py-2 text-slate-500 font-medium" />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s: any) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <td className="py-2 text-slate-900 dark:text-white">{s.name}</td>
                    <td className="py-2 text-slate-500 max-w-[200px] truncate">{s.description || '-'}</td>
                    <td className="py-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', snapshotStatusColors[s.status] || '')}>{s.status}</span>
                    </td>
                    <td className="py-2 text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="py-2 text-right">
                      {s.status === 'created' && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => handleRollbackSnapshot(s.id, s.name)} className="text-amber-500 hover:text-amber-700" title="Rollback"><RotateCcw className="h-4 w-4" /></button>
                          <button onClick={() => handleDeleteSnapshot(s.id)} className="text-red-500 hover:text-red-700" title="Delete"><Trash className="h-4 w-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* ISO Management Modal */}
      {showIso && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">ISO Management</h3>

            {/* Current ISO */}
            {currentIso && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Currently Mounted</p>
                <p className="text-sm text-slate-900 dark:text-white font-mono mt-1">{currentIso.storage}:iso/{currentIso.iso}</p>
              </div>
            )}

            {/* Browse ISOs */}
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Browse ISOs</h4>
            <div className="flex gap-2 mb-3">
              <select
                value={selectedIsoStorage}
                onChange={(e) => { setSelectedIsoStorage(e.target.value); setIsoList([]); }}
                className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {isoStorages.map((s: any) => (
                  <option key={s.storage} value={s.storage}>{s.storage}</option>
                ))}
              </select>
              <button
                onClick={async () => {
                  setLoadingIsoList(true);
                  try {
                    const res = await api.get(`/vms/${vm.id}/iso/list?storage=${selectedIsoStorage}`);
                    setIsoList(res.data);
                  } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to list ISOs'); }
                  setLoadingIsoList(false);
                }}
                className="px-3 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
              >{loadingIsoList ? '...' : 'Refresh'}</button>
            </div>

            {isoList.length > 0 ? (
              <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
                {isoList.map((iso: any) => (
                  <div key={iso.volid} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <span className="flex-1 text-sm font-mono text-slate-900 dark:text-white truncate">{iso.volid}</span>
                    <button
                      onClick={async () => {
                        setMountingIso(true);
                        try {
                          const storage = iso.volid.split(':')[0];
                          const filename = iso.volid.split('/').pop() || iso.volid;
                          await api.post(`/vms/${vm.id}/mount-iso`, { iso: filename, storage });
                          toast.success('ISO mount queued');
                          setShowIso(false);
                        } catch (err: any) { toast.error(err.response?.data?.message || 'Mount failed'); }
                        setMountingIso(false);
                      }}
                      disabled={mountingIso}
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 shrink-0"
                    >Mount</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 mb-4">Click Refresh to list ISOs in {selectedIsoStorage}</p>
            )}

            {/* Custom mount form */}
            <details className="mb-4">
              <summary className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer">Custom mount (type ISO name)</summary>
              <form onSubmit={handleMountIso} className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">ISO Filename</label>
                  <input type="text" value={isoForm.iso} onChange={(e) => setIsoForm({ ...isoForm, iso: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="ubuntu-24.04.iso" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Storage</label>
                  <input type="text" value={isoForm.storage} onChange={(e) => setIsoForm({ ...isoForm, storage: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="local" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="submit" disabled={actionVm} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Mount</button>
                </div>
              </form>
            </details>

            {/* Download from URL */}
            <details>
              <summary className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer">Download ISO from URL</summary>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!isoDownloadUrl) { toast.error('URL is required'); return; }
                setSavingIsoDownload(true);
                try {
                  await api.post(`/vms/${vm.id}/iso/download-url`, { url: isoDownloadUrl, storage: isoDownloadStorage });
                  toast.success('ISO download initiated');
                  setIsoDownloadUrl('');
                } catch (err: any) { toast.error(err.response?.data?.message || 'Download failed'); }
                setSavingIsoDownload(false);
              }} className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">URL</label>
                  <input type="url" value={isoDownloadUrl} onChange={(e) => setIsoDownloadUrl(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://releases.ubuntu.com/24.04/ubuntu-24.04-live-server-amd64.iso" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Storage</label>
                  <select value={isoDownloadStorage} onChange={(e) => setIsoDownloadStorage(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {isoStorages.map((s: any) => (
                      <option key={s.storage} value={s.storage}>{s.storage}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="submit" disabled={savingIsoDownload} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{savingIsoDownload ? 'Downloading...' : 'Download'}</button>
                </div>
              </form>
            </details>

            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setShowIso(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Network Interfaces Modal */}
      {showNetwork && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Network Interfaces</h3>
            {loadingNetwork ? (
              <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-400 border-t-transparent rounded-full" /></div>
            ) : (
              <>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">VM must be stopped to change network config.</p>
                <div className="space-y-3 mb-4">
                  {Object.keys(networkInterfaces).length === 0 ? (
                    <p className="text-sm text-slate-500">No network interfaces.</p>
                  ) : (
                    Object.entries(networkInterfaces).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-slate-900 dark:text-white break-all">{key}: {value}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete ${key}?`)) return;
                            setSavingNetwork(true);
                            try {
                              await api.delete(`/vms/${vm.id}/network/${key}`);
                              toast.success(`${key} deleted`);
                              const res = await api.get(`/vms/${vm.id}/network`);
                              setNetworkInterfaces(res.data);
                            } catch (err: any) { toast.error(err.response?.data?.message || 'Delete failed'); }
                            setSavingNetwork(false);
                          }}
                          disabled={savingNetwork}
                          className="text-red-500 hover:text-red-700 shrink-0"
                        ><Trash className="h-4 w-4" /></button>
                      </div>
                    ))
                  )}
                </div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Add / Update Interface</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Key</label>
                    <input type="text" value={networkNewKey} onChange={(e) => setNetworkNewKey(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="net0" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Value</label>
                    <input type="text" value={networkNewValue} onChange={(e) => setNetworkNewValue(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="virtio=XX:XX:XX:XX:XX:XX,bridge=vmbr0" />
                  </div>
                  <button
                    onClick={async () => {
                      if (!/^net\d+$/.test(networkNewKey)) { toast.error('Key must be net0, net1, etc.'); return; }
                      if (!networkNewValue) { toast.error('Value is required'); return; }
                      setSavingNetwork(true);
                      try {
                        await api.post(`/vms/${vm.id}/network`, { key: networkNewKey, value: networkNewValue });
                        toast.success(`${networkNewKey} updated`);
                        const res = await api.get(`/vms/${vm.id}/network`);
                        setNetworkInterfaces(res.data);
                        setNetworkNewKey('');
                        setNetworkNewValue('');
                      } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to update'); }
                      setSavingNetwork(false);
                    }}
                    disabled={savingNetwork}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  >{savingNetwork ? 'Saving...' : 'Save'}</button>
                </div>
                <div className="flex justify-end mt-4">
                  <button type="button" onClick={() => setShowNetwork(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* DNS Settings Modal */}
      {showDns && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">DNS Settings</h3>
            {loadingDns ? (
              <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-400 border-t-transparent rounded-full" /></div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSavingDns(true);
                try {
                  const payload: Record<string, string> = {};
                  if (dnsForm.nameserver1) payload.nameserver1 = dnsForm.nameserver1;
                  if (dnsForm.nameserver2) payload.nameserver2 = dnsForm.nameserver2;
                  if (dnsForm.searchdomain) payload.searchdomain = dnsForm.searchdomain;
                  await api.put(`/vms/${vm.id}/dns`, payload);
                  toast.success('DNS settings saved');
                  setShowDns(false);
                } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to save DNS'); }
                setSavingDns(false);
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nameserver 1</label>
                  <input type="text" value={dnsForm.nameserver1} onChange={(e) => setDnsForm({ ...dnsForm, nameserver1: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="8.8.8.8" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nameserver 2</label>
                  <input type="text" value={dnsForm.nameserver2} onChange={(e) => setDnsForm({ ...dnsForm, nameserver2: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="8.8.4.4" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Search Domain</label>
                  <input type="text" value={dnsForm.searchdomain} onChange={(e) => setDnsForm({ ...dnsForm, searchdomain: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="example.com" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowDns(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                  <button type="submit" disabled={savingDns} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{savingDns ? 'Saving...' : 'Save'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Snapshot Modal */}
      {showCreateSnapshot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Snapshot</h3>
            <form onSubmit={handleCreateSnapshot} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                <input type="text" value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="before-update" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description (optional)</label>
                <textarea value={snapshotDescription} onChange={(e) => setSnapshotDescription(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} placeholder="Before installing updates" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreateSnapshot(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={creatingSnapshot || !snapshotName} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{creatingSnapshot ? 'Queuing...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reinstall Progress Overlay */}
      {reinstalling && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="animate-spin h-10 w-10 border-4 border-blue-400 border-t-transparent rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Reinstalling OS</h3>
            <p className="text-sm text-slate-500 mb-4">{reinstallProgress}</p>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-4">
              <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
            <p className="text-xs text-slate-400">VM status updates every 5 seconds. Do not close this page.</p>
            <button onClick={handleCancelReinstall} className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* Hardware Config Modal */}
      {showHardware && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">QEMU Hardware Configuration</h3>
            {loadingHardware ? (
              <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-400 border-t-transparent rounded-full" /></div>
            ) : (
              <form onSubmit={handleSaveHardware} className="space-y-4">
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">Changes apply after VM reboot. The VM must be stopped to save.</p>
                <div className="grid grid-cols-2 gap-4">
                  {hardwareFields.map(({ key, label, placeholder, type }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
                      {type === 'number' ? (
                        <input type="number" value={hardwareForm[key] ?? ''} onChange={(e) => setHardwareForm({ ...hardwareForm, [key]: e.target.value ? parseInt(e.target.value) : '' })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" min={1} />
                      ) : (
                        <input type="text" value={hardwareForm[key] ?? ''} onChange={(e) => setHardwareForm({ ...hardwareForm, [key]: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={placeholder} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setShowHardware(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                  <button type="submit" disabled={savingHardware} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{savingHardware ? 'Saving...' : 'Save'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
