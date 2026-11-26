import React from 'react';
import { Search } from 'lucide-react';
import {
  ClearLibraryChecklist,
  type ClearLibraryChecklistProps,
} from './ClearLibraryChecklist';

/** Props for the custom-selection search, bulk actions, and checklist. */
export interface ClearLibraryCustomViewProps extends ClearLibraryChecklistProps {
  /** Current search query. */
  searchQuery: string;
  /** Updates the search query. */
  onSearchChange: (query: string) => void;
  /** Selects every visible row. */
  onSelectAll: () => void;
  /** Clears the current scope selection. */
  onClearSelection: () => void;
}

/**
 * Renders custom-mode search, bulk actions, and grouped checklists.
 *
 * @param props - Search state, bulk callbacks, and checklist data.
 * @returns Custom selection view.
 */
export const ClearLibraryCustomView: React.FC<ClearLibraryCustomViewProps> = ({
  searchQuery,
  onSearchChange,
  onSelectAll,
  onClearSelection,
  ...checklistProps
}) => (
  <>
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search projects and pages..."
          aria-label="Search library records"
          className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-[#090a0f] border border-[#262a3b] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#60c1e5]"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#090a0f] hover:bg-[#1c1f2e] border border-[#262a3b] text-slate-300 transition cursor-pointer"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#090a0f] hover:bg-[#1c1f2e] border border-[#262a3b] text-slate-300 transition cursor-pointer"
        >
          Clear Selection
        </button>
      </div>
    </div>

    <ClearLibraryChecklist {...checklistProps} />
  </>
);
