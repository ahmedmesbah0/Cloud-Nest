'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Server, Mail, Eye, EyeOff, Check, Loader2 } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Settings {
  [key: string]: string;
}

export default function AdminSettingsPage() {
  const { data: settings, mutate, isLoading } = useSWR<Settings>('/admin/settings', fetcher);
  const [saving, setSaving] = useState<string | null>(null);

  const [showProxmox, setShowProxmox] = useState(false);
  const [showSmtp, setShowSmtp] = useState(false);

  const [proxmoxForm, setProxmoxForm] = useState({
    proxmox_host: '',
    proxmox_token_id: '',
    proxmox_token_secret: '',
    proxmox_node: 'pve',
    proxmox_storage: 'local-lvm',
  });

  const [smtpForm, setSmtpForm] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: 'noreply@cloudnest.io',
  });

  useEffect(() => {
    if (settings) {
      setProxmoxForm({
        proxmox_host: settings.proxmox_host || '',
        proxmox_token_id: settings.proxmox_token_id || '',
        proxmox_token_secret: settings.proxmox_token_secret || '',
        proxmox_node: settings.proxmox_node || 'pve',
        proxmox_storage: settings.proxmox_storage || 'local-lvm',
      });
      setSmtpForm({
        smtp_host: settings.smtp_host || '',
        smtp_port: settings.smtp_port || '587',
        smtp_user: settings.smtp_user || '',
        smtp_pass: settings.smtp_pass || '',
        smtp_from: settings.smtp_from || 'noreply@cloudnest.io',
      });
    }
  }, [settings]);

  const saveProxmox = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving('proxmox');
    try {
      await api.put('/admin/settings', proxmoxForm);
      toast.success('Proxmox settings saved');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const saveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving('smtp');
    try {
      await api.put('/admin/settings', smtpForm);
      toast.success('SMTP settings saved');
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const inputClass = 'w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';
  const cardClass = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6';
  const sectionTitleClass = 'text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Settings</h1>
        <p className="text-slate-500 mt-1">Configure system-wide settings for CloudNest.</p>
      </div>

      <form onSubmit={saveProxmox} className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Server className="h-5 w-5 text-orange-500" />
          Proxmox VE
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Host</label>
            <input
              type="text"
              value={proxmoxForm.proxmox_host}
              onChange={(e) => setProxmoxForm({ ...proxmoxForm, proxmox_host: e.target.value })}
              className={inputClass}
              placeholder="172.16.1.10:8006"
            />
          </div>
          <div>
            <label className={labelClass}>API Token ID</label>
            <input
              type="text"
              value={proxmoxForm.proxmox_token_id}
              onChange={(e) => setProxmoxForm({ ...proxmoxForm, proxmox_token_id: e.target.value })}
              className={inputClass}
              placeholder="root@pam!cloudnest"
            />
          </div>
          <div>
            <label className={labelClass}>API Token Secret</label>
            <div className="relative">
              <input
                type={showProxmox ? 'text' : 'password'}
                value={proxmoxForm.proxmox_token_secret}
                onChange={(e) => setProxmoxForm({ ...proxmoxForm, proxmox_token_secret: e.target.value })}
                className={inputClass}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <button
                type="button"
                onClick={() => setShowProxmox(!showProxmox)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showProxmox ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Node</label>
              <input
                type="text"
                value={proxmoxForm.proxmox_node}
                onChange={(e) => setProxmoxForm({ ...proxmoxForm, proxmox_node: e.target.value })}
                className={inputClass}
                placeholder="pve"
              />
            </div>
            <div>
              <label className={labelClass}>Storage</label>
              <input
                type="text"
                value={proxmoxForm.proxmox_storage}
                onChange={(e) => setProxmoxForm({ ...proxmoxForm, proxmox_storage: e.target.value })}
                className={inputClass}
                placeholder="local-lvm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving === 'proxmox'}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            {saving === 'proxmox' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving === 'proxmox' ? 'Saving...' : 'Save Proxmox Settings'}
          </button>
        </div>
      </form>

      <form onSubmit={saveSmtp} className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Mail className="h-5 w-5 text-blue-500" />
          SMTP / Email
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>SMTP Host</label>
            <input
              type="text"
              value={smtpForm.smtp_host}
              onChange={(e) => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })}
              className={inputClass}
              placeholder="smtp.example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Port</label>
              <input
                type="number"
                value={smtpForm.smtp_port}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtp_port: e.target.value })}
                className={inputClass}
                placeholder="587"
              />
            </div>
            <div>
              <label className={labelClass}>From address</label>
              <input
                type="email"
                value={smtpForm.smtp_from}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtp_from: e.target.value })}
                className={inputClass}
                placeholder="noreply@cloudnest.io"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Username</label>
            <input
              type="text"
              value={smtpForm.smtp_user}
              onChange={(e) => setSmtpForm({ ...smtpForm, smtp_user: e.target.value })}
              className={inputClass}
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input
                type={showSmtp ? 'text' : 'password'}
                value={smtpForm.smtp_pass}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtp_pass: e.target.value })}
                className={inputClass}
                placeholder="smtp password"
              />
              <button
                type="button"
                onClick={() => setShowSmtp(!showSmtp)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showSmtp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving === 'smtp'}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            {saving === 'smtp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving === 'smtp' ? 'Saving...' : 'Save SMTP Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
