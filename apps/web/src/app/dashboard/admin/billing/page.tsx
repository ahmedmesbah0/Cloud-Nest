'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { CreditCard, DollarSign } from 'lucide-react';
import { formatCents } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminBillingPage() {
  const { data: pricing, mutate } = useSWR<Record<string, string>>('/admin/billing-pricing', fetcher);
  const [form, setForm] = useState({
    price_per_core: '0.005',
    price_per_gb_ram: '0.01',
    price_per_gb_disk: '0.001',
    grace_period_hours: '48',
  });
  const [saving, setSaving] = useState(false);
  const { data: invoices } = useSWR('/billing/invoices?page=1&limit=10', fetcher);

  useEffect(() => {
    if (pricing) {
      setForm({
        price_per_core: pricing.price_per_core || '0.005',
        price_per_gb_ram: pricing.price_per_gb_ram || '0.01',
        price_per_gb_disk: pricing.price_per_gb_disk || '0.001',
        grace_period_hours: pricing.grace_period_hours || '48',
      });
    }
  }, [pricing]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/admin/billing-pricing', {
        price_per_core: form.price_per_core,
        price_per_gb_ram: form.price_per_gb_ram,
        price_per_gb_disk: form.price_per_gb_disk,
        grace_period_hours: form.grace_period_hours,
      });
      toast.success('Pricing saved');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Billing Configuration</h1>
        <p className="text-slate-500 mt-1">Manage pricing and billing settings.</p>
      </div>

      <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-500" /> Pricing (per hour)
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Per Core ($)</label>
              <input type="number" step="0.001" min="0" value={form.price_per_core} onChange={(e) => setForm({ ...form, price_per_core: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Per GB RAM ($)</label>
              <input type="number" step="0.001" min="0" value={form.price_per_gb_ram} onChange={(e) => setForm({ ...form, price_per_gb_ram: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Per GB Disk ($)</label>
              <input type="number" step="0.0001" min="0" value={form.price_per_gb_disk} onChange={(e) => setForm({ ...form, price_per_gb_disk: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Grace Period (hours before suspension)</label>
            <input type="number" min="1" value={form.grace_period_hours} onChange={(e) => setForm({ ...form, grace_period_hours: e.target.value })} className={`${inputClass} max-w-xs`} />
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Pricing'}
          </button>
        </div>
      </form>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-500" /> Recent Invoices
        </h2>
        {invoices?.invoices?.length > 0 ? (
          <div className="space-y-2">
            {invoices.invoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Invoice #{inv.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-500">{inv.status} · {new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="text-sm font-medium">{formatCents(inv.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No invoices yet.</p>
        )}
      </div>
    </div>
  );
}
