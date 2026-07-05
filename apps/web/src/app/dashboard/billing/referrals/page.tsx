'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatCents, formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { PageCard } from '@/components/ui/page-card';
import { Button } from '@/components/ui/button';
import { Users, Copy, Check, Link as LinkIcon, Coins } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function ReferralsPage() {
  const { data: myCode, mutate: mutateCode } = useSWR('/referrals/my-code', fetcher);
  const { data: stats, mutate: mutateStats } = useSWR('/referrals/my-stats', fetcher);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post('/referrals/generate');
      toast.success('Referral code generated!');
      mutateCode();
      mutateStats();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate code');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!myCode?.code) return;
    try {
      await navigator.clipboard.writeText(myCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeeming(true);
    try {
      const res = await api.post('/referrals/redeem', { code: redeemCode });
      toast.success(`Referral redeemed! ${formatCents(res.data.rewardCredits)} credited.`);
      setRedeemCode('');
      mutateStats();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid referral code');
    } finally {
      setRedeeming(false);
    }
  };

  const referralLink = myCode?.code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/register?ref=${myCode.code}`
    : null;

  return (
    <div className="space-y-6">
      <PageCard
        title="Your Referral Code"
        description="Share your code and earn credits when friends sign up"
        headerExtra={
          myCode?.code ? (
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          ) : undefined
        }
      >
        {myCode?.code ? (
          <div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <LinkIcon className="h-5 w-5 text-primary" />
              <code className="text-lg font-bold text-foreground">{myCode.code}</code>
            </div>
            {referralLink && (
              <p className="text-xs text-muted-foreground mt-2">
                Share link: <span className="text-primary">{referralLink}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">You haven't generated a referral code yet.</p>
            <Button onClick={handleGenerate} loading={generating}>
              <Users className="h-4 w-4" /> Generate Code
            </Button>
          </div>
        )}
      </PageCard>

      <PageCard title="Redeem a Referral Code">
        <form onSubmit={handleRedeem} className="flex gap-2">
          <input
            type="text"
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value)}
            placeholder="Enter referral code"
            className="flex-1 bg-muted border border-input rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
          <Button type="submit" loading={redeeming}>
            <Users className="h-4 w-4" /> Redeem
          </Button>
        </form>
      </PageCard>

      {stats && (
        <PageCard title="Referral Stats">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-foreground">{stats.totalReferrals}</p>
              <p className="text-sm text-muted-foreground">Referrals</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-green-500">{formatCents(stats.totalRewards)}</p>
              <p className="text-sm text-muted-foreground">Earned</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-foreground">{stats.uses}/{stats.maxUses || '∞'}</p>
              <p className="text-sm text-muted-foreground">Uses</p>
            </div>
          </div>

          {stats.usage?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-foreground mb-2">Recent Referrals</h4>
              <div className="space-y-2">
                {stats.usage.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {u.referredUser?.name || u.referredUser?.email || 'User'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Coins className="h-4 w-4 text-green-500" />
                      <span className="text-green-500">+{formatCents(u.rewardCredits || 0)}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PageCard>
      )}
    </div>
  );
}
