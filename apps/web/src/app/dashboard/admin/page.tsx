'use client';

import useSWR from 'swr';
import api from '@/lib/api';
import { formatCents, formatDateTime } from '@/lib/utils';
import { Users, Server, Activity, HardDrive, CreditCard } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminDashboardPage() {
  const { data: stats } = useSWR('/admin/dashboard', fetcher);

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Total VMs', value: stats.totalVms, icon: Server, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: 'Running VMs', value: stats.activeVms, icon: Activity, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Nodes', value: stats.totalNodes, icon: HardDrive, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { label: 'Wallets', value: stats.totalWallets, icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Revenue', value: formatCents(stats.totalBalance), icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Users</h2>
          <div className="space-y-3">
            {(stats.recentUsers || []).map((u: any) => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                    {(u.name || u.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{u.name || 'Unnamed'}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(u.createdAt)}</span>
              </div>
            ))}
            {(!stats.recentUsers || stats.recentUsers.length === 0) && (
              <p className="text-sm text-slate-500">No users yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent VMs</h2>
          <div className="space-y-3">
            {(stats.recentVms || []).map((vm: any) => (
              <div key={vm.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{vm.name || `VM #${vm.vmid}`}</p>
                  <p className="text-xs text-slate-500">{vm.user?.email || 'unknown'} &middot; {vm.cpuCores}c / {vm.memoryMb}mb</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  vm.status === 'running' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                  vm.status === 'stopped' ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' :
                  vm.status === 'provisioning' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {vm.status}
                </span>
              </div>
            ))}
            {(!stats.recentVms || stats.recentVms.length === 0) && (
              <p className="text-sm text-slate-500">No VMs yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
