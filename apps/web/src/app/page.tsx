'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, ArrowRight, Server, Shield, Zap } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <header className="border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="h-8 w-8 text-blue-400" />
            <span className="text-xl font-bold text-white">CloudNest</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-slate-300 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              href="/register"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
            Deploy in seconds.
            <br />
            <span className="text-blue-400">Scale infinitely.</span>
          </h1>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Self-service VPS hosting with instant provisioning, resource pooling,
            and full control. Powered by Proxmox.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-3 rounded-lg transition-colors"
          >
            Start Free <ArrowRight className="h-5 w-5" />
          </Link>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Server, title: 'Instant Provisioning', desc: 'Create a VPS in under 30 seconds with automated cloud-init setup.' },
              { icon: Shield, title: 'Resource Isolation', desc: 'Dedicated CPU, RAM, and SSD storage with guaranteed performance.' },
              { icon: Zap, title: 'Full Control', desc: 'Root access, custom ISOs, snapshots, and live VNC console.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
                <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Icon className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
