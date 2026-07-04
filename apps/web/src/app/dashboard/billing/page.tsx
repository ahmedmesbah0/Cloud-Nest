'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { CreditCard, ArrowDownCircle, ArrowUpCircle, Gift, FileText } from 'lucide-react';
import { formatCents, formatDateTime } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function BillingPage() {
  const { data: wallet, mutate: mutateWallet } = useSWR('/wallet', fetcher);
  const { data: charges } = useSWR('/billing/charges', fetcher);
  const [voucherCode, setVoucherCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const transactions = wallet?.transactions?.slice(0, 20) || [];
  const chargeData = (charges || []).slice(-24).map((c: any) => ({
    time: new Date(c.createdAt).toLocaleTimeString('en-US', { hour: '2-digit' }),
    cost: (c.amount || 0) / 100,
  }));

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeeming(true);
    try {
      await api.post('/vouchers/redeem', { code: voucherCode });
      toast.success('Voucher redeemed!');
      setVoucherCode('');
      mutateWallet();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid voucher');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Billing</h1>

      <div className="grid lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Wallet Balance</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {wallet ? formatCents(wallet.balance) : '$0.00'}
              </p>
            </div>
          </div>
        </div>

        <Link href="/dashboard/billing/invoices" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
              <FileText className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Invoices</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">View all &rarr;</p>
            </div>
          </div>
        </Link>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 lg:col-span-2">
          <h2 className="text-sm font-medium text-slate-500 mb-3">Redeem voucher</h2>
          <form onSubmit={handleRedeem} className="flex gap-2">
            <input
              type="text"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              placeholder="Enter voucher code"
              className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={redeeming}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
            >
              <Gift className="h-4 w-4" /> Redeem
            </button>
          </form>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Usage charges</h2>
          {chargeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chargeData}>
                <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm">No charges yet.</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent transactions</h2>
          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div className="flex items-center gap-3">
                    {tx.type === 'credit' ? (
                      <ArrowDownCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm text-slate-900 dark:text-white">{tx.reference || tx.type}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(tx.createdAt)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{formatCents(Math.abs(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No transactions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
