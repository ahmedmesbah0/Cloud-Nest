'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { ArrowLeft, Send, LifeBuoy } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusColors: Record<string, string> = {
  open: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  waiting_customer: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  resolved: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  closed: 'bg-slate-100 dark:bg-slate-700 text-slate-400',
};

export default function TicketDetailPage() {
  const params = useParams();
  const { data: ticket, error, isLoading, mutate } = useSWR(`/support-tickets/${params.id}`, fetcher);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/support-tickets/${params.id}/messages`, { message: reply });
      toast.success('Reply sent');
      setReply('');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="text-center py-16">
        <LifeBuoy className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Ticket not found</h3>
        <p className="text-sm text-slate-500 mb-4">This ticket does not exist or you don't have access.</p>
        <Link href="/dashboard/support" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">&larr; Back to support</Link>
      </div>
    );
  }

  const messages = ticket.messages ?? [];
  const isClosed = ticket.status === 'closed';

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/support"
          className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">{ticket.subject}</h1>
          <p className="text-sm text-slate-500">Created {formatDateTime(ticket.createdAt)}</p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${statusColors[ticket.status] || statusColors.open}`}>
          {ticket.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-200 dark:divide-slate-700 mb-6">
        {messages.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No messages yet.</div>
        ) : (
          messages.map((msg: any) => (
            <div key={msg.id} className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {msg.user?.name || msg.user?.email || 'Unknown'}
                </span>
                <span className="text-xs text-slate-500">{formatDateTime(msg.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{msg.body}</p>
            </div>
          ))
        )}
      </div>

      {isClosed ? (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-500">This ticket is closed. Further replies are not allowed.</p>
        </div>
      ) : (
        <form onSubmit={handleReply} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Reply</label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Write your reply..."
            className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            required
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
            >
              <Send className="h-4 w-4" /> {sending ? 'Sending...' : 'Send Reply'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
