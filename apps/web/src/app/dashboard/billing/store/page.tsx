'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatCents } from '@/lib/utils';
import toast from 'react-hot-toast';
import { PageCard } from '@/components/ui/page-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ResourceCard } from '@/components/ui/resource-card';
import { Gift, Cpu, MemoryStick, HardDrive, Server, Camera, CopyCheck, ShoppingCart } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function StorePage() {
  const { data: packages, mutate } = useSWR('/resource-packages', fetcher);
  const { data: purchases, mutate: mutatePurchases } = useSWR('/resource-packages/me/purchases', fetcher);
  const { data: limits } = useSWR('/resource-packages/me/limits', fetcher);
  const [buying, setBuying] = useState<string | null>(null);

  const handlePurchase = async (pkgId: string) => {
    setBuying(pkgId);
    try {
      await api.post(`/resource-packages/${pkgId}/purchase`);
      toast.success('Package purchased! Resources added.');
      mutate();
      mutatePurchases();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Purchase failed');
    } finally {
      setBuying(null);
    }
  };

  const pkgList = packages || [];

  return (
    <div>
      {limits && (
        <PageCard className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Accumulated Addon Resources</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'CPU Cores', value: limits.cpuCores, icon: Cpu },
              { label: 'Memory', value: `${limits.memoryMb} MB`, icon: MemoryStick },
              { label: 'Disk', value: `${limits.diskGb} GB`, icon: HardDrive },
              { label: 'Servers', value: limits.serverLimit, icon: Server },
              { label: 'Backups', value: limits.backupLimit, icon: Camera },
              { label: 'Snapshots', value: limits.snapshotLimit, icon: CopyCheck },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="font-medium text-foreground">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </PageCard>
      )}

      {pkgList.length === 0 ? (
        <PageCard>
          <EmptyState
            icon={Gift}
            title="Store is empty"
            description="No resource packages are available right now."
          />
        </PageCard>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pkgList.map((pkg: any) => {
            const hasDiscount = pkg.discountEnabled && pkg.discountPercent > 0;
            const discountedPrice = hasDiscount
              ? Math.round(pkg.priceCredits * (1 - pkg.discountPercent / 100))
              : pkg.priceCredits;

            return (
              <PageCard key={pkg.id} className="flex flex-col">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-foreground">{pkg.name}</h3>
                  {pkg.description && (
                    <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
                  )}

                  <div className="mt-4 space-y-2">
                    {pkg.cpuLimit > 0 && (
                      <div className="flex items-center gap-2 text-sm"><Cpu className="h-4 w-4 text-muted-foreground" /><span>+{pkg.cpuLimit} CPU Cores</span></div>
                    )}
                    {pkg.memoryLimit > 0 && (
                      <div className="flex items-center gap-2 text-sm"><MemoryStick className="h-4 w-4 text-muted-foreground" /><span>+{pkg.memoryLimit} MB RAM</span></div>
                    )}
                    {pkg.diskLimit > 0 && (
                      <div className="flex items-center gap-2 text-sm"><HardDrive className="h-4 w-4 text-muted-foreground" /><span>+{pkg.diskLimit} GB SSD</span></div>
                    )}
                    {pkg.serverLimit > 0 && (
                      <div className="flex items-center gap-2 text-sm"><Server className="h-4 w-4 text-muted-foreground" /><span>+{pkg.serverLimit} Server{pkg.serverLimit > 1 ? 's' : ''}</span></div>
                    )}
                  </div>

                  <div className="mt-4 text-center">
                    {hasDiscount ? (
                      <div>
                        <span className="text-2xl font-bold text-primary">{formatCents(discountedPrice)}</span>
                        <span className="text-sm text-muted-foreground line-through ml-2">{formatCents(pkg.priceCredits)}</span>
                        <span className="ml-1 text-xs font-medium text-green-500">-{pkg.discountPercent}%</span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold text-primary">{formatCents(pkg.priceCredits)}</span>
                    )}
                  </div>
                </div>

                <Button className="mt-4 w-full" onClick={() => handlePurchase(pkg.id)} loading={buying === pkg.id}>
                  <ShoppingCart className="h-4 w-4" /> Purchase
                </Button>
              </PageCard>
            );
          })}
        </div>
      )}

      {purchases && purchases.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-foreground mb-4">Purchase History</h3>
          <div className="space-y-3">
            {purchases.map((p: any) => (
              <ResourceCard
                key={p.id}
                icon={Gift}
                title={p.package?.name || 'Package'}
                subtitle={`Purchased ${new Date(p.createdAt).toLocaleDateString()} — ${formatCents(p.priceCredits)}`}
              >
                <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                  {p.cpuLimit > 0 && <span>{p.cpuLimit} CPU</span>}
                  {p.memoryLimit > 0 && <span>{p.memoryLimit} MB</span>}
                  {p.diskLimit > 0 && <span>{p.diskLimit} GB</span>}
                </div>
              </ResourceCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
