'use client';

import { useState } from 'react';
import api from '@/lib/api';
import useSWR from 'swr';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminNotificationsPage() {
  const { data: users } = useSWR('/admin/users?limit=200', fetcher);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [sending, setSending] = useState(false);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) return;
    setSending(true);
    try {
      await api.post('/admin/notifications/broadcast', {
        title,
        body,
        userId: targetUserId || undefined,
      });
      toast.success(targetUserId ? 'Notification sent to user' : 'Notification broadcast to all users');
      setTitle('');
      setBody('');
      setTargetUserId('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Send Notification</h1>

      <div className="max-w-lg">
        <form onSubmit={handleBroadcast} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target</label>
            <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white">
              <option value="">All users</option>
              {(users?.users || []).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="Notification title" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" rows={4} placeholder="Notification message" required />
          </div>
          <button type="submit" disabled={sending || !title || !body} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            <Send className="h-4 w-4" /> {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </form>
      </div>
    </div>
  );
}
