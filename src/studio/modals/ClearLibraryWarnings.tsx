import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ClearLibraryMode } from '../state/projectStore';

/** Props for the clear-mode notices and active-target warning. */
export interface ClearLibraryWarningsProps {
  /** Active clearing mode; the destructive notice is shown for Clear All. */
  mode: ClearLibraryMode;
  /** Whether the active project is a deletion target. */
  activeProjectTargeted: boolean;
  /** Whether the active translated page is a deletion target. */
  activeJobTargeted: boolean;
  /** Last deletion error, if any. */
  errorMessage: string | null;
}

/**
 * Renders the permanent-deletion notice, active-target warning, and error.
 *
 * @param props - Warning flags and error text.
 * @returns Warning blocks.
 */
export const ClearLibraryWarnings: React.FC<ClearLibraryWarningsProps> = ({
  mode,
  activeProjectTargeted,
  activeJobTargeted,
  errorMessage,
}) => (
  <>
    {mode === 'all' && (
      <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-3 text-xs text-slate-300 leading-relaxed">
        <span className="font-semibold text-red-300">Everything in this scope will be permanently deleted.</span>
        <span className="block mt-1 text-slate-400">
          Project metadata and page image records cannot be recovered after clearing.
        </span>
      </div>
    )}

    {(activeProjectTargeted || activeJobTargeted) && (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <span>
          {activeProjectTargeted && 'Active project is included. '}
          {activeJobTargeted && 'Active translated page is included. '}
          Close it in the editor before clearing to avoid losing unsaved edits.
        </span>
      </div>
    )}

    {errorMessage && (
      <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
        {errorMessage}
      </div>
    )}
  </>
);
