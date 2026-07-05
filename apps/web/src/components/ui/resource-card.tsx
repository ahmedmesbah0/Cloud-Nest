'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface Badge {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'ghost' | 'danger';
}

interface ResourceCardProps {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  description?: string;
  badges?: Badge[];
  actions?: Action[];
  className?: string;
  children?: React.ReactNode;
}

const badgeStyles: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-green-500/10 text-green-600 dark:text-green-400',
  warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

export function ResourceCard({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  description,
  badges,
  actions,
  className,
  children,
}: ResourceCardProps) {
  return (
    <div
      className={cn(
        'glass-card p-5 hover:shadow-md transition-shadow',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {Icon && (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${iconColor ?? 'hsl(var(--primary))'}15`, color: iconColor ?? 'hsl(var(--primary))' }}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              {badges?.map((badge, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                    badgeStyles[badge.variant ?? 'default'],
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            )}
            {description && (
              <p className="text-sm text-muted-foreground/80 mt-1">{description}</p>
            )}
          </div>
        </div>

        {actions && actions.length > 0 && (
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  action.variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  action.variant === 'danger' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                  (!action.variant || action.variant === 'ghost') && 'text-muted-foreground hover:bg-muted',
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
