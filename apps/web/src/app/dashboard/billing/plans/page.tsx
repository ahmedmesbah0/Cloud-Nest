'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatCents } from '@/lib/utils';
import toast from 'react-hot-toast';
import { PageCard } from '@/components/ui/page-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ShoppingCart, Cpu, MemoryStick, HardDrive, Server, Camera, CopyCheck, Tag } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function PlansPage() {
  const { data: plans, mutate: mutatePlans } = useSWR('/plans', fetcher);
  const { data: categories } = useSWR('/plans/categories', fetcher);
  const [subscribeId, setSubscribeId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponValid, setCouponValid] = useState<any>(null);
  const [validating, setValidating] = useState(false);

  const handleSubscribe = async (planId: string) => {
    setSubscribing(true);
    try {
      await api.post('/subscriptions', { planId, couponCode: couponValid?.couponId ? couponCode : undefined });
      toast.success('Subscribed! Your VM is being provisioned.');
      setSubscribeId(null);
      setCouponCode('');
      setCouponValid(null);
      mutatePlans();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Subscription failed');
    } finally {
      setSubscribing(false);
    }
  };

  const handleValidateCoupon = async (planId: string) => {
    if (!couponCode) return;
    setValidating(true);
    try {
      const res = await api.post(`/plans/${planId}/coupons/validate`, { code: couponCode });
      setCouponValid(res.data);
      if (res.data.valid) toast.success(`Coupon applies! ${res.data.discountPercent ? `${res.data.discountPercent}% off` : ''}${res.data.discountCredits ? ` ${formatCents(res.data.discountCredits)} off` : ''}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid coupon');
      setCouponValid(null);
    } finally {
      setValidating(false);
    }
  };

  const plansList = plans || [];
  const categoriesList = categories || [];

  if (plansList.length === 0) {
    return (
      <PageCard>
        <EmptyState
          icon={ShoppingCart}
          title="No plans available"
          description="There are no active plans right now. Check back later."
        />
      </PageCard>
    );
  }

  return (
    <div>
      {categoriesList.length > 0 ? (
        categoriesList.map((cat: any) => {
          const catPlans = plansList.filter((p: any) => p.categoryId === cat.id);
          if (catPlans.length === 0) return null;
          return (
            <div key={cat.id} className="mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-1">{cat.name}</h2>
              {cat.description && <p className="text-sm text-muted-foreground mb-4">{cat.description}</p>}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catPlans.map((plan: any) => (
                  <PageCard key={plan.id} className="flex flex-col">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                      {plan.description && <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>}

                      <div className="mt-4 text-center">
                        <span className="text-3xl font-bold text-primary">{formatCents(plan.priceCredits)}</span>
                        <span className="text-sm text-muted-foreground">/{plan.billingPeriodDays}d</span>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.cpuCores} CPU Cores</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <MemoryStick className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.memoryMb} MB RAM</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.diskGb} GB SSD</span>
                        </div>
                        {plan.backupLimit > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <Camera className="h-4 w-4 text-muted-foreground" />
                            <span>{plan.backupLimit} Backups</span>
                          </div>
                        )}
                        {plan.snapshotLimit > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <CopyCheck className="h-4 w-4 text-muted-foreground" />
                            <span>{plan.snapshotLimit} Snapshots</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span>Up to {plan.serverLimit} server{plan.serverLimit > 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>

                    {subscribeId === plan.id ? (
                      <div className="mt-4 space-y-2 pt-4 border-t border-border">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={couponCode}
                            onChange={(e) => { setCouponCode(e.target.value); setCouponValid(null); }}
                            placeholder="Coupon code"
                            className="flex-1 bg-muted border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <Button size="sm" variant="outline" onClick={() => handleValidateCoupon(plan.id)} loading={validating}>
                            <Tag className="h-3 w-3" />
                          </Button>
                        </div>
                        {couponValid?.valid && <p className="text-xs text-green-500">Coupon applied!</p>}
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setSubscribeId(null); setCouponCode(''); setCouponValid(null); }}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => handleSubscribe(plan.id)} loading={subscribing}>
                            Confirm & Pay
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button className="mt-4 w-full" onClick={() => setSubscribeId(plan.id)}>
                        Subscribe
                      </Button>
                    )}
                  </PageCard>
                ))}
              </div>
            </div>
          );
        })
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plansList.map((plan: any) => (
            <PageCard key={plan.id} className="flex flex-col">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                {plan.description && <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>}
                <div className="mt-4 text-center">
                  <span className="text-3xl font-bold text-primary">{formatCents(plan.priceCredits)}</span>
                  <span className="text-sm text-muted-foreground">/{plan.billingPeriodDays}d</span>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm"><Cpu className="h-4 w-4 text-muted-foreground" /><span>{plan.cpuCores} CPU Cores</span></div>
                  <div className="flex items-center gap-2 text-sm"><MemoryStick className="h-4 w-4 text-muted-foreground" /><span>{plan.memoryMb} MB RAM</span></div>
                  <div className="flex items-center gap-2 text-sm"><HardDrive className="h-4 w-4 text-muted-foreground" /><span>{plan.diskGb} GB SSD</span></div>
                </div>
              </div>
              {subscribeId === plan.id ? (
                <div className="mt-4 space-y-2 pt-4 border-t border-border">
                  <div className="flex gap-2">
                    <input type="text" value={couponCode} onChange={(e) => { setCouponCode(e.target.value); setCouponValid(null); }} placeholder="Coupon code" className="flex-1 bg-muted border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    <Button size="sm" variant="outline" onClick={() => handleValidateCoupon(plan.id)} loading={validating}><Tag className="h-3 w-3" /></Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setSubscribeId(null); setCouponCode(''); setCouponValid(null); }}>Cancel</Button>
                    <Button size="sm" onClick={() => handleSubscribe(plan.id)} loading={subscribing}>Confirm & Pay</Button>
                  </div>
                </div>
              ) : (
                <Button className="mt-4 w-full" onClick={() => setSubscribeId(plan.id)}>Subscribe</Button>
              )}
            </PageCard>
          ))}
        </div>
      )}
    </div>
  );
}
