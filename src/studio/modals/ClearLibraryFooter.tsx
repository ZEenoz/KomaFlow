import React from 'react';
import { ArrowDownWideNarrow, Trash2 } from 'lucide-react';
import type { ClearLibraryMode } from '../state/projectStore';
import type { ClearLibrarySummary } from './clearLibrarySelection';
import { formatClearSummary } from './clearLibrarySelection';

/** Props for the Clear Library summary and confirm footer. */
export interface ClearLibraryFooterProps {
  /** Current deletion totals. */
  summary: ClearLibrarySummary;
  /** Whether the storage breakdown is still loading. */
  isLoading: boolean;
  /** Whether at least one record will be deleted. */
  hasTargets: boolean;
  /** Whether a deletion request is in flight. */
  isSubmitting: boolean;
  /** Active clearing mode, used for the confirm label. */
  mode: ClearLibraryMode;
  /** Closes without deleting. */
  onCancel: () => void;
  /** Confirms deletion. */
  onConfirm: () => void;
}

/**
 * Renders the live deletion summary and destructive confirm action.
 *
 * @param props - Summary counts, busy state, and callbacks.
 * @returns Dialog footer.
 */
export const ClearLibraryFooter: React.FC<ClearLibraryFooterProps> = ({
  summary,
  isLoading,
  hasTargets,
  isSubmitting,
  mode,
  onCancel,
  onConfirm,
}) => (
  <div className="px-5 py-3 border-t border-[#262a3b] bg-[#141724] flex items-center justify-between gap-3 shrink-0">
    <div className="text-xs text-slate-300 tabular-nums" data-testid="clear-library-summary">
      <span className="inline-flex items-center gap-1.5 text-slate-400">
        <ArrowDownWideNarrow className="w-3.5 h-3.5" />
        {isLoading ? 'Calculating size...' : formatClearSummary(summary)}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={!hasTargets || isSubmitting}
        onClick={onConfirm}
        data-testid="clear-library-confirm"
        aria-label="Confirm clear library"
        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:pointer-events-none text-white transition cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>{isSubmitting ? 'Clearing...' : mode === 'all' ? 'Delete Everything' : 'Delete Selected'}</span>
      </button>
    </div>
  </div>
);
