'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Shield, Key, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsTabs = [
  { href: '/dashboard/settings', label: 'Profile', icon: User },
  { href: '/dashboard/settings/security', label: 'Security & 2FA', icon: Shield },
  { href: '/dashboard/settings/ssh-keys', label: 'SSH Keys', icon: Key },
  { href: '/dashboard/settings/api-keys', label: 'API Keys', icon: Terminal },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h1>
      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-56 flex-shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {settingsTabs.map(({ href, label, icon: Icon }) => {
              const active = href === '/dashboard/settings'
                ? pathname === '/dashboard/settings'
                : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
