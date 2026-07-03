'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token');
      return;
    }
    api.post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success');
        toast.success('Email verified! You can now sign in.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification failed');
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center max-w-sm w-full">
        {status === 'verifying' && (
          <>
            <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white">Verifying your email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Email verified!</h2>
            <p className="text-slate-400 mb-6">Your account is ready.</p>
            <Link href="/login" className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
              Sign in
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Verification failed</h2>
            <p className="text-slate-400 mb-6">{message}</p>
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center"><p className="text-white">Loading...</p></div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
