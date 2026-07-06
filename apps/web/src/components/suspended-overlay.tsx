import { AlertTriangle, Lock } from 'lucide-react';
import { ReactNode } from 'react';

interface SuspendedOverlayProps {
  isSuspended: boolean;
  children: ReactNode;
  message?: string;
}

export default function SuspendedOverlay({
  isSuspended,
  children,
  message = 'This server is suspended. Please resolve any outstanding balance to reactivate it.',
}: SuspendedOverlayProps) {
  if (!isSuspended) return <>{children}</>;

  return (
    <div className="relative">
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/80 dark:bg-black/80 rounded-xl backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-sm text-center shadow-2xl">
          <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Server Suspended</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{message}</p>
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>Contact support or visit billing to resolve</span>
          </div>
        </div>
      </div>
      <div className="pointer-events-none select-none opacity-30">{children}</div>
    </div>
  );
}
