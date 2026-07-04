'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Globe, Plus, X, Trash2, Wifi } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminIpPoolsPage() {
  const { data: pools, mutate } = useSWR('/ip-pools', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', subnet: '', gateway: '' });
  const [addIpForm, setAddIpForm] = useState({ poolId: '', address: '' });
  const [saving, setSaving] = useState(false);

  const { data: poolDetail } = useSWR(
    () => expandedId ? `/ip-pools/${expandedId}` : null,
    fetcher,
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/ip-pools', form);
      toast.success('IP pool created');
      setShowCreate(false);
      setForm({ name: '', subnet: '', gateway: '' });
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this IP pool?')) return;
    try {
      await api.delete(`/ip-pools/${id}`);
      toast.success('Pool deleted');
      setExpandedId(null);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleAddIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addIpForm.poolId || !addIpForm.address) return;
    setSaving(true);
    try {
      await api.post('/ip-pools/ips', addIpForm);
      toast.success('IP added');
      setAddIpForm({ poolId: '', address: '' });
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveIp = async (id: string) => {
    if (!confirm('Remove this IP?')) return;
    try {
      await api.delete(`/ip-pools/ips/${id}`);
      toast.success('IP removed');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">IP Pools</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Create Pool
        </button>
      </div>

      <div className="space-y-4">
        {(pools || []).map((pool: any) => (
          <div key={pool.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <button onClick={() => setExpandedId(expandedId === pool.id ? null : pool.id)} className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center"><Globe className="h-5 w-5 text-cyan-500" /></div>
                <div className="text-left">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{pool.name}</h3>
                  <p className="text-xs text-slate-500">{pool.subnet} · gw: {pool.gateway} · {pool._count?.addresses ?? 0} IPs</p>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(pool.id); }} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </button>
            {expandedId === pool.id && poolDetail?.id === pool.id && (
              <div className="border-t border-slate-200 dark:border-slate-700 p-4">
                <div className="flex gap-2 mb-4">
                  <input type="text" value={addIpForm.address} onChange={(e) => setAddIpForm({ poolId: pool.id, address: e.target.value })} className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="10.0.0.1" />
                  <button onClick={handleAddIp} disabled={saving || !addIpForm.address} className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {(poolDetail?.addresses || []).map((ip: any) => (
                    <div key={ip.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <div className="flex items-center gap-2">
                        <Wifi className={`h-3.5 w-3.5 ${ip.isAssigned ? 'text-green-500' : 'text-slate-400'}`} />
                        <span className="text-sm font-mono text-slate-900 dark:text-white">{ip.address}</span>
                        {ip.isAssigned && <span className="text-xs text-slate-400">(assigned)</span>}
                      </div>
                      <button onClick={() => handleRemoveIp(ip.id)} disabled={ip.isAssigned} className="text-slate-400 hover:text-red-500 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create IP Pool</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subnet</label>
                <input type="text" value={form.subnet} onChange={(e) => setForm({ ...form, subnet: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="10.0.0.0/24" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gateway</label>
                <input type="text" value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="10.0.0.1" required />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
