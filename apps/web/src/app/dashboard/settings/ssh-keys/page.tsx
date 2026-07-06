'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { Key, Plus, Trash2, Search, Undo2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function SshKeysPage() {
  const { data: keys, mutate } = useSWR('/ssh-keys', fetcher);
  const { data: deletedKeys, mutate: mutateDeleted } = useSWR('/ssh-keys/deleted', fetcher);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const filteredKeys = (keys || []).filter(
    (k: any) =>
      !search ||
      k.name.toLowerCase().includes(search.toLowerCase()) ||
      (k.fingerprint || '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/ssh-keys', { name, publicKey });
      toast.success('SSH key added');
      setName('');
      setPublicKey('');
      setShowAdd(false);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this SSH key? You can restore it later.')) return;
    try {
      await api.delete(`/ssh-keys/${id}`, { headers: { 'x-confirm': 'true' } });
      toast.success('SSH key deleted');
      mutate();
      mutateDeleted();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete key');
    }
  };

  const handleHardDelete = async (id: string) => {
    if (!confirm('Permanently delete this SSH key? This cannot be undone.')) return;
    try {
      await api.delete(`/ssh-keys/${id}/hard`, { headers: { 'x-confirm': 'true' } });
      toast.success('SSH key permanently deleted');
      mutateDeleted();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete key');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await api.post(`/ssh-keys/${id}/restore`);
      toast.success('SSH key restored');
      mutate();
      mutateDeleted();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to restore key');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SSH Keys</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600"
          >
            <AlertTriangle className="h-4 w-4" /> Deleted
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Plus className="h-4 w-4" /> Add Key
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keys by name, fingerprint..."
          className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
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
              placeholder="My Laptop"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Public key</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              rows={3}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ssh-ed25519 AAAA..."
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
              {submitting ? 'Adding...' : 'Add Key'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-700 px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {showDeleted && deletedKeys?.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Recently deleted ({deletedKeys.length})
          </h2>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl divide-y divide-amber-200 dark:divide-amber-800">
            {(deletedKeys || []).map((key: any) => (
              <div key={key.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{key.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">{key.fingerprint || key.publicKey.slice(0, 40)}...</p>
                  <p className="text-xs text-slate-400 mt-0.5">Deleted {formatDate(key.deletedAt)}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleRestore(key.id)}
                    className="p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded"
                    title="Restore"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleHardDelete(key.id)}
                    className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    title="Permanently delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
        {filteredKeys.length === 0 ? (
          <div className="p-12 text-center">
            <Key className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500">
              {search ? 'No keys match your search.' : 'No SSH keys added yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredKeys.map((key: any) => (
              <div key={key.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{key.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">{key.fingerprint || key.publicKey.slice(0, 40)}...</p>
                  <p className="text-xs text-slate-400 mt-0.5">Added {formatDate(key.createdAt)}</p>
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
