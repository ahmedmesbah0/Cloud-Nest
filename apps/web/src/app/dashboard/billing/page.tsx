'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { CreditCard, ArrowDownCircle, ArrowUpCircle, Gift, FileText, Coins } from 'lucide-react';
import { formatCents, formatDateTime } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import { PageCard } from '@/components/ui/page-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

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
      <h1 className="text-2xl font-bold text-foreground mb-6">Billing</h1>

      <div className="grid lg:grid-cols-4 gap-6 mb-8">
        <PageCard className="lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-2xl font-bold text-foreground">
                {wallet ? formatCents(wallet.balance) : '$0.00'}
              </p>
            </div>
          </div>
        </PageCard>

        <Link href="/dashboard/billing/invoices" className="lg:col-span-1">
          <PageCard className="hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <FileText className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Invoices</p>
                <p className="text-xl font-bold text-foreground">View all &rarr;</p>
              </div>
            </div>
          </PageCard>
        </Link>

        <PageCard className="lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Redeem voucher</h2>
          <form onSubmit={handleRedeem} className="flex gap-2">
            <input
              type="text"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              placeholder="Enter voucher code"
              className="flex-1 bg-muted border border-input rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <Button type="submit" loading={redeeming}>
              <Gift className="h-4 w-4" /> Redeem
            </Button>
          </form>
        </PageCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <PageCard title="Usage charges">
          {chargeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chargeData}>
                <XAxis dataKey="time" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={CreditCard} title="No charges yet" description="Usage charges will appear here once you have active services." />
          )}
        </PageCard>

        <PageCard title="Recent transactions">
          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    {tx.type === 'credit' ? (
                      <ArrowDownCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm text-foreground">{tx.reference || tx.type}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${tx.type === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{formatCents(Math.abs(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={CreditCard} title="No transactions yet" description="Your wallet transactions will appear here." />
          )}
        </PageCard>
      </div>
    </div>
  );
}
