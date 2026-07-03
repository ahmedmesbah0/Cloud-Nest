'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import api from '@/lib/api';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function NewVmPage() {
  const router = useRouter();
  const { data: pools } = useSWR('/resource-pools', fetcher);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    cpuCores: 1,
    memoryMb: 1024,
    diskGb: 10,
    poolId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.poolId) {
      toast.error('Please select a resource pool');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/vms', form);
      toast.success('VM provisioning started!');
      router.push(`/dashboard/vms/${data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create VM');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link href="/dashboard/vms" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to VMs
      </Link>

      <div className="max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create VM</h1>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="my-vm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CPU Cores</label>
              <input
                type="number"
                value={form.cpuCores}
                onChange={(e) => setForm({ ...form, cpuCores: parseInt(e.target.value) || 1 })}
                min={1}
                max={32}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">RAM (MB)</label>
              <input
                type="number"
                value={form.memoryMb}
                onChange={(e) => setForm({ ...form, memoryMb: parseInt(e.target.value) || 1024 })}
                min={512}
                max={131072}
                step={512}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disk (GB)</label>
              <input
                type="number"
                value={form.diskGb}
                onChange={(e) => setForm({ ...form, diskGb: parseInt(e.target.value) || 10 })}
                min={5}
                max={1000}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Resource Pool</label>
            <select
              value={form.poolId}
              onChange={(e) => setForm({ ...form, poolId: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a pool...</option>
              {(pools || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg transition-colors font-medium"
          >
            {submitting ? 'Creating...' : 'Create VM'}
          </button>
        </form>
      </div>
    </div>
  );
}
