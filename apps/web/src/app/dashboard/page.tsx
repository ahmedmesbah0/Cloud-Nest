'use client';

import useSWR from 'swr';
import api from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Server, CreditCard, Activity, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function DashboardPage() {
  const { data: vms } = useSWR('/vms', fetcher);
  const { data: wallet } = useSWR('/wallet', fetcher);
  const { data: charges } = useSWR('/billing/charges', fetcher);

  const vmList = vms?.filter?.((v: any) => v.status !== 'deleted') || [];
  const runningVms = vmList.filter((v: any) => v.status === 'running').length;
  const totalCores = vmList.reduce((s: number, v: any) => s + (v.cpuCores || 0), 0);

  const stats = [
    { label: 'Total VMs', value: vmList.length, icon: Server, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Running', value: runningVms, icon: Activity, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Total Cores', value: totalCores, icon: Users, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: 'Balance', value: wallet ? formatCents(wallet.balance) : '$0.00', icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  ];

  const chartData = (charges || []).slice(-24).map((c: any) => ({
    time: new Date(c.createdAt).toLocaleTimeString('en-US', { hour: '2-digit' }),
    cost: c.amount / 100,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent charges</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm">No billing data yet.</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent VMs</h2>
          {vmList.length > 0 ? (
            <div className="space-y-3">
              {vmList.slice(0, 5).map((vm: any) => (
                <div key={vm.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{vm.name || `VM #${vm.vmid}`}</p>
                    <p className="text-xs text-slate-500">{vm.cpuCores} cores / {vm.memoryMb} MB</p>
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
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No VMs yet. Create your first one!</p>
          )}
        </div>
      </div>
    </div>
  );
}
