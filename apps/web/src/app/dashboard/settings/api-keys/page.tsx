'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { Terminal, Plus, Trash2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function ApiKeysPage() {
  const { data: keys, mutate } = useSWR('/api-keys', fetcher);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post('/api-keys', { name });
      setNewKey(data.key);
      setName('');
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
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{key.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">{key.prefix || key.id.slice(0, 8)}...</p>
                  <p className="text-xs text-slate-400 mt-0.5">Created {formatDate(key.createdAt)}</p>
                </div>
                <button
                  onClick={() => handleDelete(key.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
