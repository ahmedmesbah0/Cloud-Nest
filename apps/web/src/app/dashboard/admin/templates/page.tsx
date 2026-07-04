'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Layout, Plus, Edit3, Save, X, Trash2, Check } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminTemplatesPage() {
  const { data: templates, mutate } = useSWR('/admin/templates', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', proxmoxTemplateId: '', osType: 'linux', minDiskGb: '10', minMemoryMb: '1024' });
  const [editForm, setEditForm] = useState({ name: '', minDiskGb: '', minMemoryMb: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/templates', {
        name: form.name, proxmoxTemplateId: form.proxmoxTemplateId,
        osType: form.osType, minDiskGb: parseInt(form.minDiskGb), minMemoryMb: parseInt(form.minMemoryMb),
      });
      toast.success('Template created');
      setShowCreate(false);
      setForm({ name: '', proxmoxTemplateId: '', osType: 'linux', minDiskGb: '10', minMemoryMb: '1024' });
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      await api.put(`/admin/templates/${id}`, {
        name: editForm.name,
        minDiskGb: parseInt(editForm.minDiskGb),
        minMemoryMb: parseInt(editForm.minMemoryMb),
      });
      toast.success('Template updated');
      setEditingId(null);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/admin/templates/${id}`);
      toast.success('Template deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.put(`/admin/templates/${id}`, { isActive: !current });
      toast.success(current ? 'Template deactivated' : 'Template activated');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Templates</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Add Template
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {(templates?.templates || []).map((t: any) => (
          <div key={t.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            {editingId === t.id ? (
              <div className="space-y-3">
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Name" />
                <input type="number" value={editForm.minDiskGb} onChange={(e) => setEditForm({ ...editForm, minDiskGb: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Min disk GB" />
                <input type="number" value={editForm.minMemoryMb} onChange={(e) => setEditForm({ ...editForm, minMemoryMb: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Min memory MB" />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdate(t.id)} disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Save className="h-3.5 w-3.5 inline" /> Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600"><X className="h-3.5 w-3.5 inline" /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center"><Layout className="h-5 w-5 text-blue-500" /></div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{t.name}</h3>
                    <p className="text-xs text-slate-500">{t.osType}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between"><span className="text-slate-500">Proxmox ID</span><span className="font-mono text-xs">{t.proxmoxTemplateId}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Min Disk</span><span>{t.minDiskGb} GB</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Min Memory</span><span>{t.minMemoryMb} MB</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={t.isActive ? 'text-green-600' : 'text-red-600'}>{t.isActive ? 'Active' : 'Inactive'}</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingId(t.id); setEditForm({ name: t.name, minDiskGb: String(t.minDiskGb), minMemoryMb: String(t.minMemoryMb) }); }} className="text-sm text-blue-600 hover:text-blue-500"><Edit3 className="h-3.5 w-3.5 inline" /> Edit</button>
                  <button onClick={() => handleToggleActive(t.id, t.isActive)} className="text-sm text-amber-600 hover:text-amber-500"><Check className="h-3.5 w-3.5 inline" /> {t.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => handleDelete(t.id)} className="text-sm text-red-600 hover:text-red-500"><Trash2 className="h-3.5 w-3.5 inline" /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add Template</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Proxmox Template ID</label>
                <input type="text" value={form.proxmoxTemplateId} onChange={(e) => setForm({ ...form, proxmoxTemplateId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="1000" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">OS Type</label>
                <select value={form.osType} onChange={(e) => setForm({ ...form, osType: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm">
                  <option value="linux">Linux</option>
                  <option value="windows">Windows</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Min Disk (GB)</label>
                  <input type="number" min="1" value={form.minDiskGb} onChange={(e) => setForm({ ...form, minDiskGb: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Min Memory (MB)</label>
                  <input type="number" min="512" value={form.minMemoryMb} onChange={(e) => setForm({ ...form, minMemoryMb: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
