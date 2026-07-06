'use client';

import { useContext, type ReactNode } from 'react';
import { AuthContext } from '@/lib/auth';

interface PermissionGuardProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export default function PermissionGuard({ permission, children, fallback = null }: PermissionGuardProps) {
  const ctx = useContext(AuthContext);
  const user = ctx?.user ?? null;

  if (!user) return null;

  const permissions: string[] = (user as any)?.permissions || [];
  if (!permissions.includes(permission)) return <>{fallback}</>;
  return <>{children}</>;
}
