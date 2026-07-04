'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { HardDrive, Plus, Server, Database, Activity } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminNodesPage() {
  const { data: nodes, mutate } = useSWR('/admin/nodes', fetcher);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ proxmoxNodeId: '', name: '', host: '', port: 8006 });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', host: '', port: 8006 });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/nodes', form);
      toast.success('Node added');
      setShowAdd(false);
      setForm({ proxmoxNodeId: '', name: '', host: '', port: 8006 });
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (nodeId: string) => {
    try {
      await api.put(`/admin/nodes/${nodeId}`, editForm);
      toast.success('Node updated');
      setEditingId(null);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Nodes</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Add Node
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {(nodes || []).map((node: any) => (
          <div key={node.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            {editingId === node.id ? (
              <div className="space-y-3">
                <input
                  type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                  placeholder="Name"
                />
                <input
                  type="text" value={editForm.host} onChange={(e) => setEditForm({ ...editForm, host: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                  placeholder="Host"
                />
                <input
                  type="number" value={editForm.port} onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value) || 8006 })}
                  className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                  placeholder="Port"
                />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdate(node.id)} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                      <Server className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{node.name}</h3>
                      <p className="text-xs text-slate-500">{node.host}:{node.port}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${node.isActive !== false ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 dark:bg-red-900/30 text-red-700'}`}>
                    {node.isActive !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Database className="h-4 w-4 text-slate-400" />
                    <span>{(node.inventory?.length || 0)} inventory items</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Activity className="h-4 w-4 text-slate-400" />
                    <span>{(node.storagePools?.length || 0)} storage pools</span>
                  </div>
                </div>
                <button
                  onClick={() => { setEditingId(node.id); setEditForm({ name: node.name, host: node.host, port: node.port || 8006 }); }}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        ))}
        {(!nodes || nodes.length === 0) && (
          <div className="col-span-2 text-center py-12 text-slate-500">
            <HardDrive className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p>No nodes configured yet.</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add Node</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Proxmox Node ID</label>
                <input type="text" value={form.proxmoxNodeId} onChange={(e) => setForm({ ...form, proxmoxNodeId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="pve" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="r730xd" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Host</label>
                <input type="text" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="172.16.1.10" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Port</label>
                <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 8006 })} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
