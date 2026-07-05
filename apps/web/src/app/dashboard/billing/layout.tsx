'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CreditCard, ShoppingCart, Package, Gift, Users, FileText } from 'lucide-react';

const tabs = [
  { href: '/dashboard/billing', label: 'Overview', icon: CreditCard },
  { href: '/dashboard/billing/plans', label: 'Plans', icon: ShoppingCart },
  { href: '/dashboard/billing/subscriptions', label: 'Subscriptions', icon: Package },
  { href: '/dashboard/billing/store', label: 'Store', icon: Gift },
  { href: '/dashboard/billing/referrals', label: 'Referrals', icon: Users },
  { href: '/dashboard/billing/invoices', label: 'Invoices', icon: FileText },
];

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 border-b border-border overflow-x-auto pb-px">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard/billing'
            ? pathname === '/dashboard/billing'
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors shrink-0',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
