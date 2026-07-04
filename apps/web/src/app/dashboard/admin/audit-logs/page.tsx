'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data } = useSWR(`/admin/audit-logs?page=${page}&limit=50`, fetcher);

  const filtered = data?.logs?.filter((log: any) =>
    !search
    || log.action.toLowerCase().includes(search.toLowerCase())
    || log.resource?.toLowerCase().includes(search.toLowerCase())
    || log.resourceId?.toLowerCase().includes(search.toLowerCase())
    || log.user?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Logs</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/95">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Time</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">User</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Resource</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Resource ID</th>
              </tr>
            </thead>
            <tbody>
              {(filtered || []).map((log: any) => (
                <tr key={log.id} className="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{log.user?.email || 'system'}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 capitalize">{log.resource || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{log.resourceId || '—'}</td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">Page {data.page} of {data.totalPages} ({data.total} entries)</span>
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
    </div>
  );
}
