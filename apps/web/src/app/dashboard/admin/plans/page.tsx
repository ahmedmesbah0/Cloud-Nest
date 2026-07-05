'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatCents } from '@/lib/utils';
import toast from 'react-hot-toast';
import { PageCard } from '@/components/ui/page-card';
import { Button } from '@/components/ui/button';
import { ResourceCard } from '@/components/ui/resource-card';
import { LayoutDashboard, Plus } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminPlansPage() {
  const { data: plans, mutate: mutatePlans } = useSWR('/plans?all=true', fetcher);
  const { data: categories, mutate: mutateCategories } = useSWR('/plans/categories', fetcher);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '', icon: '', color: '' });
  const [planForm, setPlanForm] = useState({ categoryId: '', name: '', description: '', priceCredits: 0, cpuCores: 1, memoryMb: 512, diskGb: 10, billingPeriodDays: 30, backupLimit: 0, snapshotLimit: 0, serverLimit: 1 });
  const [saving, setSaving] = useState(false);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/plans/categories', catForm);
      toast.success('Category created');
      setShowCatForm(false);
      setCatForm({ name: '', description: '', icon: '', color: '' });
      mutateCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...planForm, priceCredits: Number(planForm.priceCredits), cpuCores: Number(planForm.cpuCores), memoryMb: Number(planForm.memoryMb), diskGb: Number(planForm.diskGb), billingPeriodDays: Number(planForm.billingPeriodDays), backupLimit: Number(planForm.backupLimit), snapshotLimit: Number(planForm.snapshotLimit), serverLimit: Number(planForm.serverLimit) };
      if (!payload.categoryId) (payload as any).categoryId = undefined;
      await api.post('/plans', payload);
      toast.success('Plan created');
      setShowPlanForm(false);
      setPlanForm({ categoryId: '', name: '', description: '', priceCredits: 0, cpuCores: 1, memoryMb: 512, diskGb: 10, billingPeriodDays: 30, backupLimit: 0, snapshotLimit: 0, serverLimit: 1 });
      mutatePlans();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan?')) return;
    try {
      await api.delete(`/plans/${id}`);
      toast.success('Plan deleted');
      mutatePlans();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const planList = plans || [];

  return (
    <div className="space-y-6">
      <PageCard
        title="Plan Categories"
        description="Organize plans into categories"
        headerExtra={
          <Button size="sm" onClick={() => setShowCatForm(!showCatForm)}>
            <Plus className="h-4 w-4" /> Category
          </Button>
        }
      >
        {showCatForm && (
          <form onSubmit={handleAddCategory} className="mb-4 p-4 bg-muted rounded-lg space-y-3">
            <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="Category name" className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required />
            <input value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} placeholder="Description" className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <div className="flex gap-2">
              <input value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} placeholder="Icon name" className="flex-1 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <input value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} placeholder="Color (e.g. #6366f1)" className="flex-1 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={saving}>Create</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowCatForm(false)}>Cancel</Button>
            </div>
          </form>
        )}
        <div className="flex flex-wrap gap-2">
          {(categories || []).map((cat: any) => (
            <span key={cat.id} className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary text-sm rounded-full">
              {cat.name}
            </span>
          ))}
        </div>
      </PageCard>

      <PageCard
        title="Plans"
        description="Manage server plans and pricing"
        headerExtra={
          <Button size="sm" onClick={() => setShowPlanForm(!showPlanForm)}>
            <Plus className="h-4 w-4" /> Plan
          </Button>
        }
      >
        {showPlanForm && (
          <form onSubmit={handleAddPlan} className="mb-4 p-4 bg-muted rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Plan name" className="col-span-2 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required />
              <input value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} placeholder="Description" className="col-span-2 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <select value={planForm.categoryId} onChange={(e) => setPlanForm({ ...planForm, categoryId: e.target.value })} className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">No category</option>
                {(categories || []).map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
              <input type="number" value={planForm.priceCredits} onChange={(e) => setPlanForm({ ...planForm, priceCredits: +e.target.value })} placeholder="Price (cents)" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required min="1" />
              <input type="number" value={planForm.cpuCores} onChange={(e) => setPlanForm({ ...planForm, cpuCores: +e.target.value })} placeholder="CPU cores" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required min="1" />
              <input type="number" value={planForm.memoryMb} onChange={(e) => setPlanForm({ ...planForm, memoryMb: +e.target.value })} placeholder="Memory (MB)" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required min="64" />
              <input type="number" value={planForm.diskGb} onChange={(e) => setPlanForm({ ...planForm, diskGb: +e.target.value })} placeholder="Disk (GB)" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" required min="1" />
              <input type="number" value={planForm.billingPeriodDays} onChange={(e) => setPlanForm({ ...planForm, billingPeriodDays: +e.target.value })} placeholder="Billing period (days)" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <input type="number" value={planForm.serverLimit} onChange={(e) => setPlanForm({ ...planForm, serverLimit: +e.target.value })} placeholder="Server limit" className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={saving}>Create</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowPlanForm(false)}>Cancel</Button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {planList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No plans created yet.</p>
          ) : (
            planList.map((plan: any) => (
              <ResourceCard
                key={plan.id}
                icon={LayoutDashboard}
                title={plan.name}
                subtitle={`${formatCents(plan.priceCredits)}/${plan.billingPeriodDays}d — ${plan.cpuCores}vCPU / ${plan.memoryMb}MB / ${plan.diskGb}GB`}
                badges={[
                  { label: plan.isActive ? 'Active' : 'Inactive', variant: plan.isActive ? 'success' as const : 'default' as const },
                ]}
                actions={[
                  { label: 'Delete', variant: 'danger' as const, onClick: () => handleDelete(plan.id) },
                ]}
              />
            ))
          )}
        </div>
      </PageCard>
    </div>
  );
}
