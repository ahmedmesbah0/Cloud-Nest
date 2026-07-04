'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Square, Trash2 } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminVmsPage() {
  const [page, setPage] = useState(1);
  const { data, mutate } = useSWR(`/admin/vms?page=${page}&limit=20`, fetcher);

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">All VMs</h1>

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
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{vm.name || `VM #${vm.vmid}`}</td>
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
