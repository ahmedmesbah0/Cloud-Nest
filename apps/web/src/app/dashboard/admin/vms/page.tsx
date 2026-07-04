'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Square, Trash2, Plus } from 'lucide-react';
import Link from 'next/link';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminVmsPage() {
  const [page, setPage] = useState(1);
  const { data, mutate } = useSWR(`/admin/vms?page=${page}&limit=20`, fetcher);
  const { data: users } = useSWR('/admin/users?limit=200', fetcher);
  const { data: templates } = useSWR('/admin/templates', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [userId, setUserId] = useState('');
  const [vmName, setVmName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [cpuCores, setCpuCores] = useState('2');
  const [memoryMb, setMemoryMb] = useState('2048');
  const [diskGb, setDiskGb] = useState('20');
  const [creating, setCreating] = useState(false);

  const handleForceStop = async (vmId: string) => {
    try {
      await api.post(`/admin/vms/${vmId}/force-stop`);
      toast.success('VM force-stopped');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleForceDelete = async (vmId: string) => {
    if (!confirm('Force-delete this VM? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/vms/${vmId}`);
      toast.success('VM deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !vmName || !templateId) return;
    setCreating(true);
    try {
      await api.post('/admin/vms', {
        userId, name: vmName, templateId,
        cpuCores: parseInt(cpuCores), memoryMb: parseInt(memoryMb), diskGb: parseInt(diskGb),
      });
      toast.success('VM provisioning queued');
      setShowCreate(false);
      setUserId('');
      setVmName('');
      setTemplateId('');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create VM');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">All VMs</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Create VM
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create VM for User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">User</label>
                <select value={userId} onChange={e => setUserId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" required>
                  <option value="">Select user...</option>
                  {(users?.users || []).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">VM Name</label>
                <input type="text" value={vmName} onChange={e => setVmName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Template</label>
                <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" required>
                  <option value="">Select template...</option>
                  {(templates?.templates || []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.osType})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CPU Cores</label>
                  <input type="number" value={cpuCores} onChange={e => setCpuCores(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" min={1} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Memory (MB)</label>
                  <input type="number" value={memoryMb} onChange={e => setMemoryMb(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" min={512} step={512} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disk (GB)</label>
                  <input type="number" value={diskGb} onChange={e => setDiskGb(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" min={1} required />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600">Cancel</button>
                <button type="submit" disabled={creating} className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{creating ? 'Creating...' : 'Create VM'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Owner</th>
                <th className="text-center px-4 py-3 font-medium text-slate-500">Resources</th>
                <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Created</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.vms || []).map((vm: any) => (
                <tr key={vm.id} className="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    <Link href={`/dashboard/admin/vms/${vm.id}`} className="hover:text-blue-600">{vm.name || `VM #${vm.vmid}`}</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{vm.user?.email || 'unknown'}</td>
                  <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400 text-xs">{vm.cpuCores}c / {vm.memoryMb}mb / {vm.diskGb}gb</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      vm.status === 'running' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      vm.status === 'stopped' ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' :
                      vm.status === 'provisioning' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                      'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>{vm.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(vm.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleForceStop(vm.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        title="Force stop"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleForceDelete(vm.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Force delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!data?.vms || data.vms.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No VMs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">Page {data.page} of {data.totalPages} ({data.total} VMs)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= data.totalPages} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-50">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
