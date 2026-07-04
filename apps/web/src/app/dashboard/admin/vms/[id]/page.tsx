'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { ArrowLeft, Server, Activity, Shield, Plus, Trash2, Edit3, Save, X } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusColors: Record<string, string> = {
  running: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  stopped: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  provisioning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  suspended: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  scheduled_deletion: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

export default function AdminVmDetailPage() {
  const params = useParams();
  const { data: vm, mutate } = useSWR(`/admin/users/${params.id}`, fetcher);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const [firewallTab, setFirewallTab] = useState(false);
  const { data: firewall, mutate: mutateFirewall } = useSWR(
    () => params.id ? `/admin/vms/${params.id}/firewall` : null,
    fetcher,
  );

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    setSaving(true);
    try {
      await api.put(`/admin/vms/${params.id}/rename`, { name: newName });
      toast.success('VM renamed');
      setRenaming(false);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to rename');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFirewall = async () => {
    try {
      await api.post(`/admin/vms/${params.id}/firewall`, {
        action: 'ACCEPT',
        proto: 'tcp',
        dport: '80',
      });
      toast.success('Firewall rule added');
      mutateFirewall();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add rule');
    }
  };

  const handleDeleteFirewall = async (pos: number) => {
    if (!confirm('Delete this firewall rule?')) return;
    try {
      await api.delete(`/admin/vms/${params.id}/firewall/${pos}`);
      toast.success('Rule deleted');
      mutateFirewall();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete rule');
    }
  };

  const handleForceStop = async () => {
    try {
      await api.post(`/admin/vms/${params.id}/force-stop`);
      toast.success('VM force-stopped');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleForceDelete = async () => {
    if (!confirm('Force-delete this VM? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/vms/${params.id}`);
      toast.success('VM deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div>
      <Link href="/dashboard/admin/vms" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to VMs
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
            <Server className="h-6 w-6 text-purple-500" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{vm?.name || `VM #${vm?.vmid}`}</h1>
              <span className={`text-xs px-2 py-1 rounded-full ${statusColors[vm?.status] || ''}`}>{vm?.status}</span>
            </div>
            <p className="text-sm text-slate-500">Created {formatDateTime(vm?.createdAt)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleForceStop} className="px-3 py-2 text-sm rounded-lg border border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">Force Stop</button>
          <button onClick={handleForceDelete} className="px-3 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white">Force Delete</button>
        </div>
      </div>

      {renaming && (
        <form onSubmit={handleRename} className="flex gap-2 mb-6">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="New name" />
          <button type="submit" disabled={saving} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save</button>
          <button type="button" onClick={() => setRenaming(false)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600"><X className="h-4 w-4" /></button>
        </form>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Resources</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">CPU Cores</span><span className="text-sm font-medium">{vm?.cpuCores ?? '-'} cores</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Memory</span><span className="text-sm font-medium">{vm?.memoryMb ?? '-'} MB</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Disk</span><span className="text-sm font-medium">{vm?.diskGb ?? '-'} GB</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Proxmox ID</span><span className="text-sm font-mono text-slate-400">{vm?.proxmoxId ?? '-'}</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Owner</h2>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">{(vm?.user?.name || vm?.user?.email || 'U')[0].toUpperCase()}</div>
            <div>
              <p className="text-sm font-medium">{vm?.user?.name || 'Unnamed'}</p>
              <p className="text-xs text-slate-500">{vm?.user?.email || 'unknown'}</p>
            </div>
          </div>
          {!renaming && <button onClick={() => { setRenaming(true); setNewName(vm?.name || ''); }} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500"><Edit3 className="h-3.5 w-3.5" /> Rename VM</button>}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => api.post(`/admin/vms/${params.id}/force-stop`).then(() => { toast.success('Force stop queued'); mutate(); }).catch(e => toast.error(e.response?.data?.message))} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50">Force Stop</button>
            <button onClick={() => api.delete(`/admin/vms/${params.id}`).then(() => { toast.success('Delete queued'); mutate(); }).catch(e => toast.error(e.response?.data?.message))} className="px-3 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white">Delete</button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button onClick={() => setFirewallTab(false)} className={`px-4 py-3 text-sm font-medium ${!firewallTab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}>
            <Activity className="h-4 w-4 inline mr-1" /> Info
          </button>
          <button onClick={() => setFirewallTab(true)} className={`px-4 py-3 text-sm font-medium ${firewallTab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}>
            <Shield className="h-4 w-4 inline mr-1" /> Firewall
          </button>
        </div>
        <div className="p-6">
          {!firewallTab ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700"><span className="text-sm text-slate-500">VM ID</span><span className="text-sm font-mono">{vm?.id}</span></div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700"><span className="text-sm text-slate-500">Proxmox ID</span><span className="text-sm font-mono">{vm?.proxmoxId || '-'}</span></div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700"><span className="text-sm text-slate-500">Node</span><span className="text-sm">{vm?.nodeId || '-'}</span></div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700"><span className="text-sm text-slate-500">Status</span><span className="text-sm capitalize">{vm?.status}</span></div>
              <div className="flex justify-between py-2"><span className="text-sm text-slate-500">Created</span><span className="text-sm">{formatDateTime(vm?.createdAt)}</span></div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Firewall Rules</h3>
                <div className="flex gap-2">
                  <button onClick={handleAddFirewall} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-3.5 w-3.5" /> Add Rule</button>
                </div>
              </div>
              {firewall && firewall.length > 0 ? (
                <div className="space-y-2">
                  {(firewall as any[]).map((rule: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-center gap-3 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-mono ${rule.action === 'ACCEPT' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 dark:bg-red-900/30 text-red-700'}`}>{rule.action}</span>
                        <span className="text-slate-600 dark:text-slate-400">{rule.proto || 'any'}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-600 dark:text-slate-400">{rule.dport || 'any'}</span>
                        <span className="text-slate-400">from</span>
                        <span className="text-slate-600 dark:text-slate-400">{rule.source || '0.0.0.0/0'}</span>
                      </div>
                      <button onClick={() => handleDeleteFirewall(rule.pos ?? i)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No firewall rules. Proxmox defaults apply (allow all).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
