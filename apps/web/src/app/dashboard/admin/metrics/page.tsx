'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Cpu, HardDrive, MemoryStick } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminMetricsPage() {
  const [hours, setHours] = useState(24);
  const { data } = useSWR(`/metrics/aggregated?hours=${hours}`, fetcher, { refreshInterval: 60000 });

  const vmChartData = (data?.vmMetrics || []).map((m: any) => ({
    time: new Date(m.recordedAt).toLocaleTimeString(),
    cpu: m._avg?.cpuUsage ?? 0,
    mem: m._avg?.memoryUsedMb ?? 0,
    disk: m._avg?.diskUsedGb ?? 0,
  }));

  const nodeChartData = (data?.nodeMetrics || []).map((m: any) => ({
    time: new Date(m.recordedAt).toLocaleTimeString(),
    cpu: m._avg?.cpuUsage ?? 0,
    mem: m._avg?.memoryUsedMb ?? 0,
    disk: m._avg?.diskUsedGb ?? 0,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Resource Usage</h1>
        <div className="flex gap-2">
          {[1, 6, 24, 168].map((h) => (
            <button key={h} onClick={() => setHours(h)} className={`px-3 py-1.5 text-sm rounded-lg ${hours === h ? 'bg-blue-600 text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
              {h >= 24 ? `${h / 24}d` : `${h}h`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-purple-500" /> VM CPU Usage
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={vmChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} unit="%" />
              <Tooltip />
              <Line type="monotone" dataKey="cpu" stroke="#8B5CF6" name="CPU %" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <MemoryStick className="h-5 w-5 text-blue-500" /> VM Memory Usage
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={vmChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} unit="MB" />
              <Tooltip />
              <Line type="monotone" dataKey="mem" stroke="#3B82F6" name="Memory MB" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-green-500" /> Node CPU Usage
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={nodeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} unit="%" />
              <Tooltip />
              <Line type="monotone" dataKey="cpu" stroke="#10B981" name="CPU %" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-orange-500" /> Node Memory Usage
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={nodeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} unit="MB" />
              <Tooltip />
              <Line type="monotone" dataKey="mem" stroke="#F59E0B" name="Memory MB" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
