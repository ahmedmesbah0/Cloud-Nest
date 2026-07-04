'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '@/lib/api';
import { MessageSquare, Send, X, RotateCcw } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusColors: Record<string, string> = {
  open: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  closed: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
};

export default function AdminSupportTicketsPage() {
  const [filter, setFilter] = useState('');
  const { data: tickets, mutate } = useSWR(`/admin/support-tickets${filter ? `?status=${filter}` : ''}`, fetcher);
  const [selected, setSelected] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSelect = async (ticket: any) => {
    const detail = await api.get(`/admin/support-tickets/${ticket.id}`).then(r => r.data);
    setSelected(detail);
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      await api.post(`/admin/support-tickets/${selected.id}/reply`, { message: replyText });
      toast.success('Reply sent');
      setReplyText('');
      const detail = await api.get(`/admin/support-tickets/${selected.id}`).then(r => r.data);
      setSelected(detail);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reply');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async (id: string) => {
    try {
      await api.post(`/admin/support-tickets/${id}/close`);
      toast.success('Ticket closed');
      if (selected?.id === id) setSelected(null);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to close');
    }
  };

  const handleReopen = async (id: string) => {
    try {
      await api.post(`/admin/support-tickets/${id}/reopen`);
      toast.success('Ticket reopened');
      if (selected?.id === id) {
        const detail = await api.get(`/admin/support-tickets/${id}`).then(r => r.data);
        setSelected(detail);
      }
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reopen');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Support Tickets</h1>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300"
        >
          <option value="">All tickets</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Ticket List */}
        <div className="space-y-2">
          {(!tickets || tickets.length === 0) && (
            <p className="text-sm text-slate-500 py-8 text-center">No tickets found.</p>
          )}
          {(tickets || []).map((t: any) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                selected?.id === t.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.subject}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[t.status] || ''}`}>{t.status}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{t.user?.name || t.user?.email || 'Unknown'}</span>
                <span>·</span>
                <span>{t._count?.messages || 0} messages</span>
                <span>·</span>
                <span>{formatDateTime(t.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Ticket Detail */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 min-h-[400px]">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <MessageSquare className="h-12 w-12 mb-3" />
              <p className="text-sm">Select a ticket to view</p>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selected.subject}</h2>
                  <p className="text-xs text-slate-500">
                    by {selected.user?.name || selected.user?.email || 'Unknown'} · {formatDateTime(selected.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selected.status !== 'closed' ? (
                    <button onClick={() => handleClose(selected.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"><X className="h-3 w-3" /> Close</button>
                  ) : (
                    <button onClick={() => handleReopen(selected.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"><RotateCcw className="h-3 w-3" /> Reopen</button>
                  )}
                </div>
              </div>

              <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto">
                {selected.messages?.map((m: any) => (
                  <div key={m.id} className={`p-3 rounded-lg ${m.userId === selected.userId ? 'bg-slate-50 dark:bg-slate-700/50 ml-4' : 'bg-blue-50 dark:bg-blue-900/10 mr-4 border border-blue-100 dark:border-blue-800'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{m.user?.name || m.user?.email || 'Unknown'}</span>
                      {m.userId !== selected.userId && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300">Staff</span>}
                      <span className="text-xs text-slate-400 ml-auto">{formatDateTime(m.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>

              {selected.status !== 'closed' && (
                <form onSubmit={handleReply} className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white resize-none"
                    rows={3}
                    placeholder="Type your reply..."
                  />
                  <button type="submit" disabled={sending || !replyText.trim()} className="self-end flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                    <Send className="h-4 w-4" /> {sending ? '...' : 'Send'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
