'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Search, ChevronLeft, ChevronRight, Shield, ShieldOff, Wallet, Eye } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creditUserId, setCreditUserId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [crediting, setCrediting] = useState(false);

  const { data, mutate } = useSWR(`/admin/users?page=${page}&limit=20`, fetcher);

  const handleToggleActive = async (userId: string, current: boolean) => {
    try {
      await api.post(`/admin/users/${userId}/${current ? 'deactivate' : 'activate'}`);
      toast.success(current ? 'User deactivated' : 'User activated');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditUserId || !creditAmount) return;
    setCrediting(true);
    try {
      await api.post(`/admin/users/${creditUserId}/credit`, { amount: Math.round(parseFloat(creditAmount) * 100) });
      toast.success('Wallet credited');
      setCreditUserId(null);
      setCreditAmount('');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Credit failed');
    } finally {
      setCrediting(false);
    }
  };

  const filtered = data?.users?.filter((u: any) =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Users</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 font-medium text-slate-500">User</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Roles</th>
                <th className="text-center px-4 py-3 font-medium text-slate-500">VMs</th>
                <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Joined</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(filtered || []).map((u: any) => (
                <tr key={u.id} className="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                        {(u.name || u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{u.name || 'Unnamed'}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles?.map((r: any) => (
                        <span key={r.role.name} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          {r.role.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{u._count?.vms ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${u.isActive === false ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
                      {u.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/dashboard/admin/users/${u.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleToggleActive(u.id, u.isActive !== false)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      >
                        {u.isActive === false ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setCreditUserId(u.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                      >
                        <Wallet className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">Page {data.page} of {data.totalPages} ({data.total} users)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= data.totalPages} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-50">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {creditUserId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Credit Wallet</h3>
            <form onSubmit={handleCredit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10.00"
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setCreditUserId(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">Cancel</button>
                <button type="submit" disabled={crediting} className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">Credit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
