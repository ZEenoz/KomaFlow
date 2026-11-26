import type { HistoryDatePreset, HistorySortOrder } from '../state/historyFilter';

/** One selectable history date window. */
export interface HistoryDatePresetOption {
  /** Preset passed to the history filter. */
  value: HistoryDatePreset;
  /** User-facing label. */
  label: string;
}

/** Date windows shared by the library toolbar, rail, and topbar popover. */
export const HISTORY_DATE_PRESET_OPTIONS: ReadonlyArray<HistoryDatePresetOption> = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'custom', label: 'Pick Date' },
];

/** Toggle labels for the two chronological directions. */
export const HISTORY_SORT_LABELS: Readonly<Record<HistorySortOrder, string>> = {
  newest: 'Latest → Oldest',
  oldest: 'Oldest → Latest',
};

/**
 * Returns the next chronological direction for a sort toggle.
 *
 * @param order - Currently selected direction.
 * @returns The opposite direction.
 */
export function toggleHistorySortOrder(order: HistorySortOrder): HistorySortOrder {
  return order === 'newest' ? 'oldest' : 'newest';
}
