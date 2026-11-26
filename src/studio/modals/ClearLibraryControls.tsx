import React from 'react';
import type { ClearLibraryMode, ClearLibraryScope } from '../state/projectStore';

/** Scope tabs offered by the dialog. */
const SCOPES: Array<{ id: ClearLibraryScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'projects', label: 'Projects' },
  { id: 'pages', label: 'Pages' },
];

/** Props for the mode, scope, and cascade controls. */
export interface ClearLibraryControlsProps {
  /** Active clearing mode. */
  mode: ClearLibraryMode;
  /** Active record-family scope. */
  scope: ClearLibraryScope;
  /** Whether project member pages are deleted with their project. */
  cascadeProjects: boolean;
  /** Changes clearing mode. */
  onModeChange: (mode: ClearLibraryMode) => void;
  /** Changes record-family scope. */
  onScopeChange: (scope: ClearLibraryScope) => void;
  /** Changes project-cascade behavior. */
  onCascadeChange: (cascade: boolean) => void;
}

/**
 * Renders Clear All/Custom Select, scope tabs, and the project cascade toggle.
 *
 * @param props - Active mode/scope/cascade values and change callbacks.
 * @returns Clearing control block.
 */
export const ClearLibraryControls: React.FC<ClearLibraryControlsProps> = ({
  mode,
  scope,
  cascadeProjects,
  onModeChange,
  onScopeChange,
  onCascadeChange,
}) => (
  <>
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center p-0.5 rounded-lg bg-[#090a0f] border border-[#262a3b]">
        {(['all', 'custom'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onModeChange(option)}
            aria-pressed={mode === option}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              mode === option ? 'bg-[#005a9c] text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {option === 'all' ? 'Clear All' : 'Custom Select'}
          </button>
        ))}
      </div>

      <div role="tablist" aria-label="Clear scope" className="flex items-center p-0.5 rounded-lg bg-[#090a0f] border border-[#262a3b]">
        {SCOPES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={scope === entry.id}
            onClick={() => onScopeChange(entry.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              scope === entry.id
                ? 'bg-[#1c1f2e] text-[#60c1e5] border border-[#60c1e5]/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>

    {scope !== 'pages' && (
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.65rem] uppercase font-bold tracking-wider text-slate-400">Project pages</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={!cascadeProjects}
            onClick={() => onCascadeChange(false)}
            className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition cursor-pointer ${
              !cascadeProjects
                ? 'bg-[#005a9c]/15 border-[#60c1e5]/50 text-[#60c1e5]'
                : 'bg-[#090a0f] border-[#262a3b] text-slate-400 hover:text-slate-200'
            }`}
          >
            Keep project pages in History (Unlink)
          </button>
          <button
            type="button"
            aria-pressed={cascadeProjects}
            onClick={() => onCascadeChange(true)}
            className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition cursor-pointer ${
              cascadeProjects
                ? 'bg-red-500/15 border-red-500/40 text-red-300'
                : 'bg-[#090a0f] border-[#262a3b] text-slate-400 hover:text-slate-200'
            }`}
          >
            Delete projects and all their linked pages
          </button>
        </div>
      </div>
    )}
  </>
);
