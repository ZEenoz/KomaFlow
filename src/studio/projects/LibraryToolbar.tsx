import React from 'react';
import { ArrowUpDown, Calendar, LayoutGrid, List, Search, X } from 'lucide-react';
import type {
  HistoryDatePreset,
  HistorySortOrder,
  LibraryViewTab,
} from '../state/historyFilter';

/** Props for the unified library toolbar. */
export interface LibraryToolbarProps {
  /** Active top-level tab. */
  activeTab: LibraryViewTab;
  /** Changes the top-level tab. */
  onTabChange: (tab: LibraryViewTab) => void;
  /** Number of projects matching the current filters. */
  projectCount: number;
  /** Number of pages matching the current filters. */
  pageCount: number;
  /** Current search query. */
  searchQuery: string;
  /** Updates the search query. */
  onSearchChange: (query: string) => void;
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
  /** Toggles chronological order. */
  onSortOrderChange: (order: HistorySortOrder) => void;
  /** Grid or list presentation. */
  layoutMode: 'grid' | 'list';
  /** Changes presentation density. */
  onLayoutModeChange: (mode: 'grid' | 'list') => void;
  /** Number of selected projects and pages. */
  selectedCount: number;
  /** Clears every multi-selection. */
  onClearSelected: () => void;
}

/** Tab definitions for the unified library. */
const TABS: Array<{ id: LibraryViewTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'projects', label: 'Projects' },
  { id: 'pages', label: 'Pages' },
];

/**
 * Renders tabs, search, date, sort, layout, and multi-selection controls.
 *
 * @param props - Current filter state and change handlers.
 * @returns Two-row library toolbar.
 */
export const LibraryToolbar: React.FC<LibraryToolbarProps> = ({
  activeTab,
  onTabChange,
  projectCount,
  pageCount,
  searchQuery,
  onSearchChange,
  datePreset,
  onDatePresetChange,
  customDate,
  onCustomDateChange,
  sortOrder,
  onSortOrderChange,
  layoutMode,
  onLayoutModeChange,
  selectedCount,
  onClearSelected,
}) => (
  <div className="px-5 py-2.5 border-b border-[#262a3b] bg-[#12141c]/70 flex flex-col gap-2 shrink-0">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <div role="tablist" aria-label="Library view" className="flex items-center p-0.5 rounded-lg bg-[#090a0f] border border-[#262a3b]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === tab.id ? 'bg-[#005a9c] text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
          {projectCount} {projectCount === 1 ? 'project' : 'projects'} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-40 sm:w-60">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search projects and pages..."
            aria-label="Search library"
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-[#161924] border border-[#262a3b] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#60c1e5] transition"
          />
        </div>

        <div className="flex items-center p-0.5 rounded-lg bg-[#090a0f] border border-[#262a3b]">
          <button
            type="button"
            aria-pressed={layoutMode === 'grid'}
            aria-label="Grid layout"
            onClick={() => onLayoutModeChange('grid')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              layoutMode === 'grid' ? 'bg-[#005a9c] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={layoutMode === 'list'}
            aria-label="List layout"
            onClick={() => onLayoutModeChange('list')}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              layoutMode === 'list' ? 'bg-[#005a9c] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-slate-500" />
        <select
          aria-label="Date filter"
          value={datePreset}
          onChange={(event) => onDatePresetChange(event.target.value as HistoryDatePreset)}
          className="h-7 px-2 rounded-lg bg-[#161924] border border-[#262a3b] text-slate-300 text-xs focus:outline-none focus:border-[#60c1e5] transition cursor-pointer"
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="custom">Pick Date</option>
        </select>
        {datePreset === 'custom' && (
          <input
            type="date"
            aria-label="Custom date"
            value={customDate}
            onChange={(event) => onCustomDateChange(event.target.value)}
            className="h-7 px-2 rounded-lg bg-[#161924] border border-[#262a3b] text-slate-300 text-xs focus:outline-none focus:border-[#60c1e5]"
          />
        )}

        <button
          type="button"
          onClick={() => onSortOrderChange(sortOrder === 'newest' ? 'oldest' : 'newest')}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#161924] hover:bg-[#1c1f2e] border border-[#262a3b] text-slate-300 text-xs font-medium transition cursor-pointer"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
          <span>{sortOrder === 'newest' ? 'Latest → Oldest' : 'Oldest → Latest'}</span>
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 h-7 px-2.5 rounded-lg bg-[#005a9c]/10 border border-[#60c1e5]/30 text-xs">
          <span className="font-semibold text-[#60c1e5]">{selectedCount} selected</span>
          <span className="text-slate-600">{' · '}</span>
          <button
            type="button"
            onClick={onClearSelected}
            className="flex items-center gap-1 font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-3 h-3" />
            Clear Selected
          </button>
        </div>
      )}
    </div>
  </div>
);
