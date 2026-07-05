'use client';

import useSWR from 'swr';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { PageCard } from '@/components/ui/page-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ResourceCard } from '@/components/ui/resource-card';
import { Package, Cpu, MemoryStick, HardDrive, RotateCcw, Calendar } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  active: 'success',
  pending: 'warning',
  suspended: 'danger',
  cancelled: 'default',
  expired: 'default',
  grace_period: 'warning',
};

export default function SubscriptionsPage() {
  const { data: subs, mutate } = useSWR('/subscriptions', fetcher);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this subscription? The VM will stop at next renewal.')) return;
    try {
      await api.delete(`/subscriptions/${id}`);
      toast.success('Subscription cancelled');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Cancel failed');
    }
  };

  const handleRenewAll = async () => {
    try {
      await api.post('/subscriptions/renew-all');
      toast.success(`Renewals processed`);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Renewal failed');
    }
  };

  const list = subs || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">My Subscriptions</h2>
        <Button size="sm" variant="outline" onClick={handleRenewAll}>
          <RotateCcw className="h-4 w-4" /> Renew Due
        </Button>
      </div>

      {list.length === 0 ? (
        <PageCard>
          <EmptyState
            icon={Package}
            title="No subscriptions"
            description="Subscribe to a plan to get started."
            action={{ label: 'Browse Plans', href: '/dashboard/billing/plans' }}
          />
        </PageCard>
      ) : (
        <div className="space-y-4">
          {list.map((sub: any) => (
            <ResourceCard
              key={sub.id}
              icon={Package}
              title={sub.plan?.name || 'Unknown Plan'}
              subtitle={`Created ${formatDateTime(sub.createdAt)}`}
              badges={[{ label: sub.status, variant: statusColors[sub.status] || 'default' }]}
              actions={
                sub.status === 'active'
                  ? [{ label: 'Cancel', variant: 'danger' as const, onClick: () => handleCancel(sub.id) }]
                  : undefined
              }
            >
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{sub.cpuCores} CPU</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MemoryStick className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{sub.memoryMb} MB</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{sub.diskGb} GB</span>
                </div>
              </div>
              {sub.nextRenewalAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                  <Calendar className="h-4 w-4" />
                  <span>Next renewal: {formatDateTime(sub.nextRenewalAt)}</span>
                </div>
              )}
            </ResourceCard>
          ))}
        </div>
      )}
    </div>
  );
}
