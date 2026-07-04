'use client';

import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Shield, ShieldOff, Smartphone, Check, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function SecurityPage() {
  const { user, refreshUser: mutateUser } = useAuth();
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [disableToken, setDisableToken] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const handleStartSetup = async () => {
    try {
      const { data } = await api.post('/auth/2fa/generate');
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setShowSetup(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate 2FA secret');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      await api.post('/auth/2fa/enable', { token: verifyToken });
      toast.success('2FA enabled successfully');
      setShowSetup(false);
      setVerifyToken('');
      mutateUser();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid token');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      await api.post('/auth/2fa/disable', { token: disableToken });
      toast.success('2FA disabled');
      setShowDisable(false);
      setDisableToken('');
      mutateUser();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid token');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Security Settings</h1>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Two-Factor Authentication</h2>
              <p className="text-sm text-slate-500">Add an extra layer of security to your account</p>
            </div>
          </div>
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${user?.totpEnabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
            {user?.totpEnabled ? <Shield className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
            {user?.totpEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {!showSetup && !showDisable && (
          <button
            onClick={user?.totpEnabled ? () => setShowDisable(true) : handleStartSetup}
            className={`px-4 py-2 text-sm rounded-lg ${user?.totpEnabled ? 'border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
          >
            {user?.totpEnabled ? 'Disable 2FA' : 'Setup 2FA'}
          </button>
        )}

        {showSetup && qrCode && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-slate-500 text-center font-mono break-all">Secret: {secret}</p>
            <form onSubmit={handleVerify} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Verify with 6-digit code from your authenticator app</label>
                <input
                  type="text"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-lg text-center font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={verifying || verifyToken.length !== 6} className="flex items-center gap-1 px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50">
                  <Check className="h-4 w-4" /> Verify & Enable
                </button>
                <button type="button" onClick={() => setShowSetup(false)} className="flex items-center gap-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600">
                  <X className="h-4 w-4" /> Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {showDisable && (
          <form onSubmit={handleDisable} className="mt-4 space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">Enter a 2FA code from your authenticator app to disable:</p>
            <input
              type="text"
              value={disableToken}
              onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-lg text-center font-mono"
              placeholder="000000"
              maxLength={6}
              required
            />
            <div className="flex gap-2">
              <button type="submit" disabled={verifying || disableToken.length !== 6} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">Disable 2FA</button>
              <button type="button" onClick={() => setShowDisable(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
