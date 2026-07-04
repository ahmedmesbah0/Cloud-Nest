'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { Shield, Users, Plus, Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminRolesPage() {
  const { data: roles, mutate } = useSWR('/admin/roles', fetcher);
  const { data: permissions } = useSWR('/admin/permissions', fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<any>(null);
  const [permRole, setPermRole] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/roles', { name, description });
      toast.success('Role created');
      setShowCreate(false);
      setName('');
      setDescription('');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRole) return;
    setSaving(true);
    try {
      await api.put(`/admin/roles/${editRole.id}`, { name, description });
      toast.success('Role updated');
      setEditRole(null);
      setName('');
      setDescription('');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role: any) => {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/roles/${role.id}`);
      toast.success('Role deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete role');
    }
  };

  const handleAddPermission = async (roleId: string, permissionId: string) => {
    try {
      await api.post(`/admin/roles/${roleId}/permissions`, { permissionId });
      toast.success('Permission added');
      setPermRole(null);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add permission');
    }
  };

  const handleRemovePermission = async (roleId: string, permissionId: string) => {
    try {
      await api.delete(`/admin/roles/${roleId}/permissions/${permissionId}`);
      toast.success('Permission removed');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove permission');
    }
  };

  const assignedPermissionIds = (roleId: string) => {
    const role = (roles || []).find((r: any) => r.id === roleId);
    return new Set((role?.permissions || []).map((p: any) => p.permissionId));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Roles</h1>
        <button onClick={() => { setName(''); setDescription(''); setShowCreate(true); }} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" /> Create Role
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Role</h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="e.g. support" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="Optional description" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600">Cancel</button>
                <button type="submit" disabled={saving || !name} className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{saving ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditRole(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Edit Role</h2>
            <form onSubmit={handleUpdate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setEditRole(null)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600">Cancel</button>
                <button type="submit" disabled={saving || !name} className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Modal */}
      {permRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPermRole(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Permissions: {permRole.name}</h2>
              <button onClick={() => setPermRole(null)}><X className="h-4 w-4 text-slate-500" /></button>
            </div>
            <div className="space-y-2">
              {(permissions || []).map((p: any) => {
                const assigned = assignedPermissionIds(permRole.id).has(p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono ${assigned ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-slate-100 dark:bg-slate-600 text-slate-500'}`}>{p.action}</span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{p.resource}</span>
                    </div>
                    {assigned ? (
                      <button onClick={() => handleRemovePermission(permRole.id, p.id)} className="text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button>
                    ) : (
                      <button onClick={() => handleAddPermission(permRole.id, p.id)} className="text-green-500 hover:text-green-700"><Plus className="h-4 w-4" /></button>
                    )}
                  </div>
                );
              })}
              {(!permissions || permissions.length === 0) && (
                <p className="text-sm text-slate-500">No permissions available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {(roles || []).map((role: any) => (
          <div key={role.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white capitalize">{role.name}</h3>
                  <p className="text-xs text-slate-500">{role.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setName(role.name); setDescription(role.description || ''); setEditRole(role); }} className="text-slate-400 hover:text-blue-500"><Pencil className="h-3.5 w-3.5" /></button>
                {role.name !== 'admin' && (
                  <button onClick={() => handleDelete(role)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
              <Users className="h-4 w-4" />
              <span>{role._count?.users || 0} users</span>
            </div>

            <div className="space-y-2">
              <button onClick={() => setPermRole(role)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500">
                <Shield className="h-3 w-3" /> Manage permissions ({role.permissions?.length || 0})
              </button>
            </div>
          </div>
        ))}
        {(!roles || roles.length === 0) && (
          <div className="col-span-3 text-center py-12 text-slate-500">
            <Shield className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p>No roles defined.</p>
          </div>
        )}
      </div>
    </div>
  );
}
