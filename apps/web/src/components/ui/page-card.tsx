'use client';

import { cn } from '@/lib/utils';

interface PageCardProps {
  title?: string;
  description?: string;
  variant?: 'default' | 'danger' | 'warning';
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageCard({
  title,
  description,
  variant = 'default',
  headerExtra,
  footer,
  className,
  children,
}: PageCardProps) {
  const variantStyles: Record<string, string> = {
    default: 'border-border',
    danger: 'border-red-500/30 bg-red-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
  };

  return (
    <div
      className={cn(
        'glass-card overflow-hidden',
        variantStyles[variant],
        className,
      )}
    >
      {(title || headerExtra) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          {headerExtra && <div className="flex items-center gap-2">{headerExtra}</div>}
        </div>
      )}
      {children && <div className="px-6 py-4">{children}</div>}
      {footer && (
        <div className="px-6 py-3 border-t border-border bg-muted/30">
          {footer}
        </div>
      )}
    </div>
  );
}
