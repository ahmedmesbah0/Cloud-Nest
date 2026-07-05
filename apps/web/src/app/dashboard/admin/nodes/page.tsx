'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { HardDrive, Plus, Server, Database, Activity, MapPin, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  online: { label: 'Online', icon: CheckCircle, color: 'bg-green-100 dark:bg-green-900/30 text-green-700' },
  offline: { label: 'Offline', icon: XCircle, color: 'bg-red-100 dark:bg-red-900/30 text-red-700' },
  maintenance: { label: 'Maintenance', icon: AlertTriangle, color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700' },
  unknown: { label: 'Unknown', icon: Clock, color: 'bg-slate-100 dark:bg-slate-700 text-slate-500' },
};

export default function AdminNodesPage() {
  const { data: nodes, mutate } = useSWR('/admin/nodes', fetcher);
  const { data: locations } = useSWR('/admin/locations', fetcher);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ proxmoxNodeId: '', name: '', host: '', port: 8006 });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', host: '', port: 8006 });

  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

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

  const handleStatusUpdate = async (nodeId: string, status: string, locationId?: string) => {
    setUpdatingStatus(nodeId);
    try {
      await api.patch(`/admin/nodes/${nodeId}/status`, { status, ...(locationId !== undefined ? { locationId } : {}) });
      toast.success('Status updated');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const locs = locations || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Nodes</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Add Node
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {(nodes || []).map((node: any) => {
          const status = statusConfig[node.status] || statusConfig.unknown;
          const StatusIcon = status.icon;
          const loc = locations?.find((l: any) => l.id === node.locationId);
          return (
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
                    <span className={cn('text-xs px-2 py-1 rounded-full inline-flex items-center gap-1', status.color)}>
                      <StatusIcon className="h-3 w-3" /> {status.label}
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
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      {loc ? `${loc.name} (${loc.region})` : 'No location'}
                    </div>
                    {node.lastSeenAt && (
                      <span className="text-xs text-slate-400">
                        Last seen: {new Date(node.lastSeenAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    {['online', 'offline', 'maintenance', 'unknown'].map((s) => {
                      const cfg = statusConfig[s];
                      const Icon = cfg.icon;
                      const isCurrent = node.status === s;
                      return (
                        <button
                          key={s}
                          disabled={updatingStatus === node.id}
                          onClick={() => handleStatusUpdate(node.id, s)}
                          className={cn(
                            'text-xs px-2 py-1 rounded-full border transition-colors inline-flex items-center gap-1',
                            isCurrent
                              ? cfg.color + ' border-transparent'
                              : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                          )}
                        >
                          <Icon className="h-3 w-3" /> {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                  {locs.length > 0 && (
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs text-slate-500">Location:</span>
                      <select
                        value={node.locationId || ''}
                        onChange={(e) => handleStatusUpdate(node.id, node.status || 'unknown', e.target.value || undefined)}
                        disabled={updatingStatus === node.id}
                        className="text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-slate-700 dark:text-slate-300"
                      >
                        <option value="">None</option>
                        {locs.map((l: any) => (
                          <option key={l.id} value={l.id}>{l.name} ({l.region})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => { setEditingId(node.id); setEditForm({ name: node.name, host: node.host, port: node.port || 8006 }); }}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          );
        })}
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
