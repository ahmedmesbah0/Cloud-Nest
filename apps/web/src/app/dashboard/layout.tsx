'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTheme } from 'next-themes';
import {
  Cloud, LayoutDashboard, Server, CreditCard, LifeBuoy,
  LogOut, Menu, X, Moon, Sun, ChevronDown, ChevronRight, Key, Terminal, Shield,
  Users, Settings, FileText, UserCheck, HardDrive, Bell, Globe, Gift, BarChart3, MessageSquare,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import useSWR from 'swr';
import api from '@/lib/api';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/vms', label: 'VMs', icon: Server },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings/ssh-keys', label: 'SSH Keys', icon: Key },
  { href: '/dashboard/settings/api-keys', label: 'API Keys', icon: Terminal },
  { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
];

const adminNavItems = [
  { href: '/dashboard/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/vms', label: 'VMs', icon: Server },
  { href: '/dashboard/admin/nodes', label: 'Nodes', icon: HardDrive },
  { href: '/dashboard/admin/templates', label: 'Templates', icon: LayoutDashboard },
  { href: '/dashboard/admin/ip-pools', label: 'IP Pools', icon: Globe },
  { href: '/dashboard/admin/vouchers', label: 'Vouchers', icon: Gift },
  { href: '/dashboard/admin/plans', label: 'Plans', icon: LayoutDashboard },
  { href: '/dashboard/admin/resource-packages', label: 'Addons', icon: Gift },
  { href: '/dashboard/admin/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/admin/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/admin/audit-logs', label: 'Audit Logs', icon: FileText },
  { href: '/dashboard/admin/roles', label: 'Roles', icon: UserCheck },
  { href: '/dashboard/admin/metrics', label: 'Metrics', icon: BarChart3 },
  { href: '/dashboard/admin/support-tickets', label: 'Support', icon: MessageSquare },
  { href: '/dashboard/admin/notifications', label: 'Notify', icon: Bell },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { data: notifData } = useSWR('/notifications?page=1&limit=1', (url) =>
    api.get(url).then((r) => r.data),
    { refreshInterval: 30000 },
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAdmin = user.roles?.some((r) => r.role.name === 'admin');

  return (
    <div className="min-h-screen bg-background">
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Cloud className="h-7 w-7 text-primary" />
            <span className="font-bold text-foreground">CloudNest</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors',
                  pathname.startsWith('/dashboard/admin')
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <span className="flex items-center gap-3">
                  <Shield className="h-4 w-4" />
                  Admin
                </span>
                {adminOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {adminOpen && (
                <div className="ml-6 space-y-1">
                  {adminNavItems.map(({ href, label, icon: Icon }) => {
                    const active = href === '/dashboard/admin'
                      ? pathname === '/dashboard/admin'
                      : pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between h-16 px-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground">
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-4">
              {mounted && (
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>
              )}

              <Link
                href="/dashboard/notifications"
                className="relative text-muted-foreground hover:text-foreground"
              >
                <Bell className="h-5 w-5" />
                {(notifData?.unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-destructive rounded-full">
                    {notifData.unreadCount > 9 ? '9+' : notifData.unreadCount}
                  </span>
                )}
              </Link>

              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                  <span className="hidden sm:block">{user.name || user.email}</span>
                  <ChevronDown className="h-4 w-4 hidden sm:block" />
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-20 py-1">
                      <div className="px-4 py-2 border-b border-border">
                        <p className="text-sm font-medium text-foreground">{user.name || 'User'}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Link
                        href="/dashboard/settings/ssh-keys"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-foreground hover:bg-muted"
                      >
                        Settings
                      </Link>
                      <button
                        onClick={() => { setUserMenuOpen(false); logout(); }}
                        className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-muted flex items-center gap-2"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
