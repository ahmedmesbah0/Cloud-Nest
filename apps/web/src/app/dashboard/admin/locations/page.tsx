'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Globe, Pencil, Trash2, MapPin, Building } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminLocationsPage() {
  const { data: locations, mutate } = useSWR('/admin/locations', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', region: '', country: '', datacenter: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.region || !form.country) {
      toast.error('Name, region, and country are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const payload: Record<string, string> = {};
        if (form.name) payload.name = form.name;
        if (form.region) payload.region = form.region;
        if (form.country) payload.country = form.country;
        if (form.datacenter) payload.datacenter = form.datacenter;
        await api.put(`/admin/locations/${editingId}`, payload);
        toast.success('Location updated');
      } else {
        await api.post('/admin/locations', form);
        toast.success('Location created');
      }
      setShowCreate(false);
      setEditingId(null);
      setForm({ name: '', region: '', country: '', datacenter: '' });
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (loc: any) => {
    setForm({ name: loc.name, region: loc.region, country: loc.country, datacenter: loc.datacenter || '' });
    setEditingId(loc.id);
    setShowCreate(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this location? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/locations/${id}`);
      toast.success('Location deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const locs = locations || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Locations</h1>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); setForm({ name: '', region: '', country: '', datacenter: '' }); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {editingId ? 'Edit Location' : 'Add Location'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="US East" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Region *</label>
                <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="North America" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Country *</label>
                <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="United States" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Datacenter</label>
                <input type="text" value={form.datacenter} onChange={(e) => setForm({ ...form, datacenter: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="Datacenter 1" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowCreate(false); setEditingId(null); }} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {locs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center">
          <Globe className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No locations</h2>
          <p className="text-slate-500">Add your first datacenter location to organize nodes.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {locs.map((loc: any) => (
            <div key={loc.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{loc.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-500">
                        <Building className="h-3.5 w-3.5 inline mr-1" />
                        {loc.region}, {loc.country}
                      </span>
                      {loc.datacenter && (
                        <span className="text-xs text-slate-400">| {loc.datacenter}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600">
                        {loc._count?.nodes || 0} nodes
                      </span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', loc.isActive ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500')}>
                        {loc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(loc)} className="p-2 text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(loc.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
