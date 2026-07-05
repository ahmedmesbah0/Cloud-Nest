'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatCents } from '@/lib/utils';
import toast from 'react-hot-toast';
import { PageCard } from '@/components/ui/page-card';
import { Button } from '@/components/ui/button';
import { ResourceCard } from '@/components/ui/resource-card';
import { Gift, Plus, Cpu, MemoryStick, HardDrive, Server } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminResourcePackagesPage() {
  const { data: packages, mutate } = useSWR('/resource-packages?all=true', fetcher);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', priceCredits: 0, memoryLimit: 0, cpuLimit: 0, diskLimit: 0, serverLimit: 1, backupLimit: 0, snapshotLimit: 0 });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/resource-packages', form);
      toast.success('Resource package created');
      setShowForm(false);
      setForm({ name: '', description: '', priceCredits: 0, memoryLimit: 0, cpuLimit: 0, diskLimit: 0, serverLimit: 1, backupLimit: 0, snapshotLimit: 0 });
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this package?')) return;
    try {
      await api.delete(`/resource-packages/${id}`);
      toast.success('Package deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const pkgList = packages || [];

  return (
    <PageCard
      title="Resource Packages"
      description="One-time addon purchases for users"
      headerExtra={
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" /> Package
        </Button>
      }
    >
      {showForm && (
        <form onSubmit={handleSave} className="mb-4 p-4 bg-muted rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Package name" className="col-span-2 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="col-span-2 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="number" value={form.priceCredits} onChange={(e) => setForm({ ...form, priceCredits: +e.target.value })} placeholder="Price (cents)" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required min="1" />
            <input type="number" value={form.cpuLimit} onChange={(e) => setForm({ ...form, cpuLimit: +e.target.value })} placeholder="CPU cores" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="number" value={form.memoryLimit} onChange={(e) => setForm({ ...form, memoryLimit: +e.target.value })} placeholder="Memory (MB)" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="number" value={form.diskLimit} onChange={(e) => setForm({ ...form, diskLimit: +e.target.value })} placeholder="Disk (GB)" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="number" value={form.serverLimit} onChange={(e) => setForm({ ...form, serverLimit: +e.target.value })} placeholder="Server limit" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saving}>Create</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {pkgList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No resource packages created yet.</p>
        ) : (
          pkgList.map((pkg: any) => (
            <ResourceCard
              key={pkg.id}
              icon={Gift}
              title={pkg.name}
              subtitle={formatCents(pkg.priceCredits)}
              badges={[{ label: pkg.isActive ? 'Active' : 'Inactive', variant: pkg.isActive ? 'success' as const : 'default' as const }]}
              actions={[{ label: 'Delete', variant: 'danger' as const, onClick: () => handleDelete(pkg.id) }]}
            >
              <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                {pkg.cpuLimit > 0 && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />+{pkg.cpuLimit} CPU</span>}
                {pkg.memoryLimit > 0 && <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" />+{pkg.memoryLimit} MB</span>}
                {pkg.diskLimit > 0 && <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />+{pkg.diskLimit} GB</span>}
                {pkg.serverLimit > 0 && <span className="flex items-center gap-1"><Server className="h-3 w-3" />x{pkg.serverLimit}</span>}
              </div>
            </ResourceCard>
          ))
        )}
      </div>
    </PageCard>
  );
}
