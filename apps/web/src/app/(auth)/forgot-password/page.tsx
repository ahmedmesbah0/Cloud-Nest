'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Cloud } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center max-w-sm w-full">
          <Cloud className="h-12 w-12 text-blue-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
          <p className="text-slate-400 mb-6">
            If an account with that email exists, we sent a password reset link.
          </p>
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Cloud className="h-8 w-8 text-blue-400" />
          <span className="text-2xl font-bold text-white">CloudNest</span>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-1">Reset password</h2>
          <p className="text-slate-400 text-sm mb-6">Enter your email and we&apos;ll send you a reset link</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fp-email" className="block text-sm text-slate-300 mb-1">Email</label>
              <input
                id="fp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg transition-colors"
            >
              {submitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6">
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
