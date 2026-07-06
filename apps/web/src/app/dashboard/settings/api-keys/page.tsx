'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { Terminal, Plus, Trash2, Copy, Globe, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function ApiKeysPage() {
  const { data: keys, mutate } = useSWR('/api-keys', fetcher);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [allowedIps, setAllowedIps] = useState('');
  const [notifyForeignIp, setNotifyForeignIp] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = { name };
      if (allowedIps.trim()) payload.allowedIps = allowedIps.trim();
      payload.notifyForeignIp = notifyForeignIp;
      const { data } = await api.post('/api-keys', payload);
      setNewKey(data.key);
      setName('');
      setAllowedIps('');
      setNotifyForeignIp(true);
      setShowAdd(false);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this API key? This cannot be undone.')) return;
    try {
      await api.delete(`/api-keys/${id}`);
      toast.success('API key deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete key');
    }
  };

  const handleToggleIpNotify = async (id: string, current: boolean) => {
    try {
      await api.patch(`/api-keys/${id}`, { notifyForeignIp: !current });
      toast.success('Updated');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  if (newKey) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">API Key Created</h1>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-2">Copy this key now. You won&apos;t be able to see it again.</p>
          <div className="flex gap-2">
            <code className="flex-1 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-sm font-mono break-all">
              {newKey}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copied!'); }}
              className="p-2 text-slate-500 hover:text-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-4 text-sm text-blue-600 hover:text-blue-500">
            Back to API keys
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">API Keys</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          <Plus className="h-4 w-4" /> Create Key
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Key name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="CI/CD"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Allowed IPs (optional CIDR, comma-separated)
            </label>
            <input
              type="text"
              value={allowedIps}
              onChange={(e) => setAllowedIps(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="203.0.113.0/24, 198.51.100.1"
            />
            <p className="text-xs text-slate-400 mt-1">Leave empty to allow any IP</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={notifyForeignIp}
              onChange={(e) => setNotifyForeignIp(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            Notify me when accessed from a new IP address
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
              {submitting ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-700 px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
        {(keys || []).length === 0 ? (
          <div className="p-12 text-center">
            <Terminal className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500">No API keys created yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {(keys || []).map((key: any) => (
              <div key={key.id} className="flex items-center justify-between p-4">
                <div className="flex-1">
                  <p className="font-medium text-slate-900 dark:text-white">{key.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-slate-500 font-mono">{key.id.slice(0, 8)}...</p>
                    <p className="text-xs text-slate-400">Created {formatDate(key.createdAt)}</p>
                    {key.lastUsedAt && (
                      <p className="text-xs text-slate-400">Last used {formatDate(key.lastUsedAt)}</p>
                    )}
                  </div>
                  {key.allowedIps && (
                    <div className="flex items-center gap-1 mt-1">
                      <Shield className="h-3 w-3 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400 font-mono">{key.allowedIps}</span>
                    </div>
                  )}
                  {!key.allowedIps && (
                    <div className="flex items-center gap-1 mt-1">
                      <Globe className="h-3 w-3 text-slate-400" />
                      <span className="text-xs text-slate-400">No IP restriction</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer" title="Notify on foreign IP">
                    <input
                      type="checkbox"
                      checked={key.notifyForeignIp}
                      onChange={() => handleToggleIpNotify(key.id, key.notifyForeignIp)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    Notify
                  </label>
                  <button
                    onClick={() => handleDelete(key.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
