'use client';

import { useState } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Mail, Calendar, Shield, CheckCircle, XCircle, Pencil, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { data: profile, mutate } = useSWR('/auth/me', fetcher);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch('/auth/me', { name });
      toast.success('Profile updated');
      setEditing(false);
      refreshUser();
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  const info = profile || user;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
              {(info?.name || info?.email || '?')[0].toUpperCase()}
            </div>
            <div>
              {editing ? (
                <form onSubmit={handleSave} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Your name"
                    required
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setName(info?.name || ''); }}
                    className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                    {info?.name || 'Unnamed User'}
                  </h2>
                  <button
                    onClick={() => { setName(info?.name || ''); setEditing(true); }}
                    className="p-1 text-slate-400 hover:text-primary rounded"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">{info?.email}</p>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium text-foreground truncate">{info?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            {info?.emailVerified ? (
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-500 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Email verified</p>
              <p className="text-sm font-medium text-foreground">
                {info?.emailVerified ? 'Verified' : 'Not verified'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Two-factor auth</p>
              <p className="text-sm font-medium text-foreground">
                {info?.totpEnabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Member since</p>
              <p className="text-sm font-medium text-foreground">
                {info?.createdAt ? formatDate(info.createdAt) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
