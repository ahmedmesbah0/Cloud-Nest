'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatCents, formatDateTime } from '@/lib/utils';
import { ArrowLeft, Shield, ShieldOff, Wallet, Plus, X } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminUserDetailPage() {
  const params = useParams();
  const { data: user, error, mutate } = useSWR(`/admin/users/${params.id}`, fetcher);

  const [creditAmount, setCreditAmount] = useState('');
  const [crediting, setCrediting] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [addingRole, setAddingRole] = useState(false);

  const handleToggleActive = async () => {
    const action = user.isActive === false ? 'activate' : 'deactivate';
    try {
      await api.post(`/admin/users/${user.id}/${action}`);
      toast.success(`User ${action}d`);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditAmount) return;
    setCrediting(true);
    try {
      await api.post(`/admin/users/${user.id}/credit`, { amount: Math.round(parseFloat(creditAmount) * 100) });
      toast.success('Wallet credited');
      setCreditAmount('');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Credit failed');
    } finally {
      setCrediting(false);
    }
  };

  const handleAddRole = async () => {
    if (!newRole) return;
    setAddingRole(true);
    try {
      await api.post(`/admin/users/${user.id}/roles/${newRole}`);
      toast.success(`Role "${newRole}" assigned`);
      setNewRole('');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to assign role');
    } finally {
      setAddingRole(false);
    }
  };

  const handleRemoveRole = async (role: string) => {
    try {
      await api.delete(`/admin/users/${user.id}/roles/${role}`);
      toast.success(`Role "${role}" removed`);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove role');
    }
  };

  if (error?.response?.status === 404) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">User not found</h2>
        <Link href="/dashboard/admin/users" className="text-blue-600 hover:text-blue-500 mt-2 inline-block">Back to users</Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <Link href="/dashboard/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-lg font-medium">
            {(user.name || user.email)[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{user.name || 'Unnamed'}</h1>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleToggleActive}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
            user.isActive === false
              ? 'border-green-200 dark:border-green-900 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
              : 'border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
          }`}
        >
          {user.isActive === false ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          {user.isActive === false ? 'Activate' : 'Deactivate'}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Profile</h2>
          <div className="space-y-3">
            {[
              { label: 'Email', value: user.email },
              { label: 'Name', value: user.name || '—' },
              { label: 'Email Verified', value: user.emailVerified ? 'Yes' : 'No' },
              { label: '2FA', value: user.totpEnabled ? 'Enabled' : 'Disabled' },
              { label: 'Status', value: user.isActive === false ? 'Inactive' : 'Active' },
              { label: 'Joined', value: formatDateTime(user.createdAt) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Roles</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {user.roles?.map((r: any) => (
              <span key={r.role.name} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                {r.role.name}
                <button onClick={() => handleRemoveRole(r.role.name)} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {(!user.roles || user.roles.length === 0) && (
              <p className="text-sm text-slate-500">No roles assigned.</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="role name"
              className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleAddRole} disabled={addingRole || !newRole} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Wallet</h2>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCents(user.wallet?.balance || 0)}</p>
              <p className="text-xs text-slate-500">Current balance</p>
            </div>
            <form onSubmit={handleCredit} className="flex gap-2 items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Credit amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-28 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10"
                />
              </div>
              <button type="submit" disabled={crediting || !creditAmount} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
                <Wallet className="h-3.5 w-3.5" /> Credit
              </button>
            </form>
          </div>
          {user.wallet?.transactions?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Recent Transactions</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {user.wallet.transactions.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <div>
                      <span className="text-xs text-slate-500 capitalize">{tx.type}</span>
                      <span className="text-xs text-slate-400 ml-2">{formatDateTime(tx.createdAt)}</span>
                    </div>
                    <span className={`text-xs font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatCents(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">VMs ({user._count?.vms ?? 0})</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {(user.vms || []).map((vm: any) => (
              <div key={vm.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{vm.name || `VM #${vm.vmid}`}</p>
                  <p className="text-xs text-slate-500">{vm.cpuCores}c / {vm.memoryMb}mb / {vm.diskGb}gb</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  vm.status === 'running' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                  vm.status === 'stopped' ? 'bg-slate-100 dark:bg-slate-700 text-slate-500' :
                  'bg-red-100 dark:bg-red-900/30 text-red-700'
                }`}>{vm.status}</span>
              </div>
            ))}
            {(!user.vms || user.vms.length === 0) && (
              <p className="text-sm text-slate-500">No VMs.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
