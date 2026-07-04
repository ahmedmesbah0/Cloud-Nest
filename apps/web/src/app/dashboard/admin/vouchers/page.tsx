'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatCents, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Gift, Plus, X, Check, Copy } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminVouchersPage() {
  const { data: vouchers, mutate } = useSWR('/vouchers', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', amount: '', maxRedemptions: '', expiresAt: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/vouchers', {
        amount: Math.round(parseFloat(form.amount) * 100),
        code: form.code || undefined,
        maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions) : undefined,
        expiresAt: form.expiresAt || undefined,
      });
      toast.success('Voucher created');
      setShowCreate(false);
      setForm({ code: '', amount: '', maxRedemptions: '', expiresAt: '' });
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this voucher? It can no longer be redeemed.')) return;
    try {
      await api.post(`/vouchers/${id}/deactivate`);
      toast.success('Voucher deactivated');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success('Copied!');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Vouchers</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white">
          <Plus className="h-4 w-4" /> Create Voucher
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Code</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Amount</th>
              <th className="text-center px-4 py-3 font-medium text-slate-500">Redeemed</th>
              <th className="text-center px-4 py-3 font-medium text-slate-500">Max</th>
              <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Expires</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(vouchers || []).map((v: any) => (
              <tr key={v.id} className="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-slate-900 dark:text-white">{v.code}</code>
                    <button onClick={() => copyCode(v.code)} className="text-slate-400 hover:text-slate-600"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">{formatCents(v.amount)}</td>
                <td className="px-4 py-3 text-center text-slate-600">{v.currentRedemptions}</td>
                <td className="px-4 py-3 text-center text-slate-600">{v.maxRedemptions || '∞'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded-full ${v.isActive === false ? 'bg-red-100 dark:bg-red-900/30 text-red-700' : 'bg-green-100 dark:bg-green-900/30 text-green-700'}`}>
                    {v.isActive === false ? 'Inactive' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{v.expiresAt ? formatDate(v.expiresAt) : 'Never'}</td>
                <td className="px-4 py-3 text-right">
                  {v.isActive !== false && (
                    <button onClick={() => handleDeactivate(v.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!vouchers || vouchers.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500"><Gift className="h-8 w-8 mx-auto mb-2 text-slate-300" />No vouchers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Voucher</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Code (leave blank for auto-generate)</label>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="SUMMER2025" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (USD)</label>
                <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Redemptions (optional)</label>
                <input type="number" min="1" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="Unlimited" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Expires At (optional)</label>
                <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={saving || !form.amount} className="flex items-center gap-1 px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"><Check className="h-4 w-4" /> Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
