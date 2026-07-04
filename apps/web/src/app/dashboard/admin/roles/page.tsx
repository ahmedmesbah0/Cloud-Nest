'use client';

import useSWR from 'swr';
import api from '@/lib/api';
import { UserCheck, Shield, Users } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminRolesPage() {
  const { data: roles } = useSWR('/admin/roles', fetcher);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Roles</h1>

      <div className="grid lg:grid-cols-3 gap-4">
        {(roles || []).map((role: any) => (
          <div key={role.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white capitalize">{role.name}</h3>
                <p className="text-xs text-slate-500">{role.description || 'No description'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
              <Users className="h-4 w-4" />
              <span>{role._count?.users || 0} users</span>
            </div>

            {role.permissions?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Permissions</p>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((rp: any) => (
                    <span key={rp.permission?.id || rp.id} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                      {rp.permission?.name || rp.permissionId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {(!roles || roles.length === 0) && (
          <div className="col-span-3 text-center py-12 text-slate-500">
            <UserCheck className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p>No roles defined.</p>
          </div>
        )}
      </div>
    </div>
  );
}
