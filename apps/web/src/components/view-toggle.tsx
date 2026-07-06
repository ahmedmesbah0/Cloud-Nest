'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';

type ViewMode = 'grid' | 'list';

interface ViewToggleProps {
  storageKey?: string;
  onToggle?: (mode: ViewMode) => void;
}

export default function ViewToggle({ storageKey = 'vm-view-mode', onToggle }: ViewToggleProps) {
  const [mode, setMode] = useState<ViewMode>('grid');

  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as ViewMode | null;
    if (stored === 'grid' || stored === 'list') setMode(stored);
  }, [storageKey]);

  const toggle = (newMode: ViewMode) => {
    setMode(newMode);
    localStorage.setItem(storageKey, newMode);
    onToggle?.(newMode);
  };

  return (
    <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
      <button
        onClick={() => toggle('grid')}
        className={`p-2 ${mode === 'grid' ? 'bg-slate-200 dark:bg-slate-600 text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
        title="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={() => toggle('list')}
        className={`p-2 ${mode === 'list' ? 'bg-slate-200 dark:bg-slate-600 text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
        title="List view"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
