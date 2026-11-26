import React from 'react';
import { ArrowUpDown, LayoutGrid, Rows3, Search } from 'lucide-react';
import type {
  HistoryDatePreset,
  HistoryLayoutMode,
  HistoryScopeFilter,
  HistorySortOrder,
} from '../state/historyFilter';
import {
  HISTORY_DATE_PRESET_OPTIONS,
  HISTORY_SORT_LABELS,
  toggleHistorySortOrder,
} from './historyControlOptions';

/** Props for the shared history filter controls. */
export interface HistoryFilterControlsProps {
  /** Current search query; the search field renders only with its change handler. */
  searchQuery?: string;
  /** Updates the search query. */
  onSearchChange?: (query: string) => void;
  /** Active date window. */
  datePreset: HistoryDatePreset;
  /** Changes the date window. */
  onDatePresetChange: (preset: HistoryDatePreset) => void;
  /** Local ISO date used by the custom window. */
  customDate: string;
  /** Updates the custom date. */
  onCustomDateChange: (date: string) => void;
  /** Active chronological order. */
  sortOrder: HistorySortOrder;
  /** Changes chronological order. */
  onSortOrderChange: (order: HistorySortOrder) => void;
  /** Active assignment scope. */
  scope: HistoryScopeFilter;
  /** Changes assignment scope. */
  onScopeChange: (scope: HistoryScopeFilter) => void;
  /** Single-column strip or two-column flex grid. */
  layoutMode: HistoryLayoutMode;
  /** Changes card density. */
  onLayoutModeChange: (mode: HistoryLayoutMode) => void;
}

/**
 * Renders the compact search/date/sort/scope/density controls shared by the
 * rail History tab and the topbar history popover.
 *
 * @param props - Current filter state and change handlers.
 * @returns Two-row filter control block.
 */
export const HistoryFilterControls: React.FC<HistoryFilterControlsProps> = ({
  searchQuery,
  onSearchChange,
  datePreset,
  onDatePresetChange,
  customDate,
  onCustomDateChange,
  sortOrder,
  onSortOrderChange,
  scope,
  onScopeChange,
  layoutMode,
  onLayoutModeChange,
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-1.5 flex-wrap">
      {searchQuery !== undefined && onSearchChange && (
        <div className="relative flex-1 min-w-[8rem]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search history pages..."
            aria-label="Search history pages"
            className="w-full h-7 pl-7 pr-2 text-xs rounded-md bg-[#161924] border border-[#262a3b] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#60c1e5]"
          />
        </div>
      )}
      <select
        aria-label="Date filter"
        value={datePreset}
        onChange={(event) => onDatePresetChange(event.target.value as HistoryDatePreset)}
        className="h-6 min-w-0 flex-1 px-1 rounded-md bg-[#161924] border border-[#262a3b] text-slate-300 text-[0.65rem] focus:outline-none focus:border-[#60c1e5] cursor-pointer"
      >
        {HISTORY_DATE_PRESET_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {datePreset === 'custom' && (
        <input
          type="date"
          aria-label="Custom date"
          value={customDate}
          onChange={(event) => onCustomDateChange(event.target.value)}
          className="h-6 px-1 rounded-md bg-[#161924] border border-[#262a3b] text-slate-300 text-[0.65rem] focus:outline-none focus:border-[#60c1e5]"
        />
      )}
    </div>

    <div className="flex items-center justify-between gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => onSortOrderChange(toggleHistorySortOrder(sortOrder))}
        title={`Sort: ${HISTORY_SORT_LABELS[sortOrder]}`}
        aria-label={`Sort: ${HISTORY_SORT_LABELS[sortOrder]}`}
        className="flex items-center gap-1 h-6 px-1.5 rounded-md bg-[#161924] hover:bg-[#1c1f2e] border border-[#262a3b] text-slate-300 text-[0.65rem] font-medium transition cursor-pointer"
      >
        <ArrowUpDown className="w-3 h-3 text-slate-500" />
        <span>{HISTORY_SORT_LABELS[sortOrder]}</span>
      </button>

      <div role="group" aria-label="History scope" className="flex items-center p-0.5 rounded-md bg-[#090a0f] border border-[#262a3b]">
        {(['all', 'unassigned'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => onScopeChange(value)}
            className={`px-1.5 py-0.5 rounded text-[0.6rem] font-semibold transition cursor-pointer ${
              scope === value ? 'bg-[#005a9c] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {value === 'all' ? 'All' : 'Unassigned'}
          </button>
        ))}
      </div>

      <div className="flex items-center p-0.5 rounded-md bg-[#090a0f] border border-[#262a3b]">
        <button
          type="button"
          aria-pressed={layoutMode === 'strip'}
          aria-label="Strip layout"
          title="Strip layout"
          onClick={() => onLayoutModeChange('strip')}
          className={`p-0.5 rounded transition cursor-pointer ${
            layoutMode === 'strip' ? 'bg-[#005a9c] text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Rows3 className="w-3 h-3" />
        </button>
        <button
          type="button"
          aria-pressed={layoutMode === 'grid'}
          aria-label="Grid layout"
          title="Grid layout"
          onClick={() => onLayoutModeChange('grid')}
          className={`p-0.5 rounded transition cursor-pointer ${
            layoutMode === 'grid' ? 'bg-[#005a9c] text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>
);
