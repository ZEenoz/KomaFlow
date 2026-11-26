import React, { useEffect, useState } from 'react';
import { Check, Folder, History, Image as ImageIcon, Maximize2, Trash2 } from 'lucide-react';
import type { ProjectFolder, TranslationJob } from '../../db';
import { getTranslatedPageThumbnailUrl } from '../canvas/thumbnailRenderer';
import { formatLocalIsoDate, getJobDisplayName } from '../state/historyFilter';

/** Layout variant used by the unified library grid. */
export type PageCardLayout = 'grid' | 'list';

/** Props for one translated-page card. */
export interface PageCardProps {
  /** Translation job represented by the card. */
  job: TranslationJob;
  /** Grid tile or horizontal list row. */
  layoutMode: PageCardLayout;
  /** Whether the multi-select checkbox is on. */
  isSelected: boolean;
  /** Whether this page is the active inspector target. */
  isActive?: boolean;
  /** Project that owns the page, when linked. */
  project?: ProjectFolder | null;
  /** Toggles multi-selection. */
  onToggleSelect: () => void;
  /** Opens the page in the Studio canvas editor. */
  onOpen: () => void;
  /** Permanently deletes the page. */
  onDelete: () => void;
}

/**
 * Renders a translated page with its thumbnail, date, project badge, and actions.
 *
 * @param props - Job, layout, selection state, and action callbacks.
 * @returns Grid tile or list row.
 */
export const PageCard: React.FC<PageCardProps> = ({
  job,
  layoutMode,
  isSelected,
  isActive = false,
  project,
  onToggleSelect,
  onOpen,
  onDelete,
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setThumbUrl(null);
    if (job.id === undefined) return;

    void getTranslatedPageThumbnailUrl(job.id, 350)
      .then((url) => {
        if (!isCancelled) setThumbUrl(url);
      })
      .catch((err) => {
        console.warn('[PageCard] Failed loading page thumbnail:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [job.id]);

  const displayName = getJobDisplayName(job);
  const localDate = formatLocalIsoDate(job.timestamp);

  const badge = project ? (
    <span className="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded bg-[#005a9c]/15 border border-[#60c1e5]/30 text-[#60c1e5] text-[0.6rem] font-semibold">
      <Folder className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate">{project.title}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1c1f2e] border border-[#262a3b] text-slate-400 text-[0.6rem] font-semibold">
      <History className="w-2.5 h-2.5" />
      <span>History</span>
    </span>
  );

  const selectionBox = (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`Select page ${displayName}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggleSelect();
      }}
      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition cursor-pointer ${
        isSelected
          ? 'bg-[#005a9c] border-[#60c1e5] text-white'
          : 'bg-[#090a0f]/80 border-[#3a4055] text-transparent hover:border-slate-400'
      }`}
    >
      <Check className="w-3.5 h-3.5" />
    </button>
  );

  const actions = (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`Open ${displayName} in Canvas`}
        title="Open in Canvas"
        className="p-1.5 rounded-md text-[#60c1e5] hover:text-white hover:bg-[#005a9c] transition cursor-pointer"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${displayName}`}
        title="Delete page"
        className="p-1.5 rounded-md text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  if (layoutMode === 'list') {
    return (
      <div
        data-testid={`page-card-${job.id}`}
        onClick={onToggleSelect}
        onDoubleClick={onOpen}
        className={`group flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition select-none ${
          isActive
            ? 'bg-[#10202f] border-[#60c1e5] ring-1 ring-[#60c1e5]/40'
            : isSelected
            ? 'bg-[#005a9c]/10 border-[#60c1e5]/50'
            : 'bg-[#12141c] hover:bg-[#161924] border-[#262a3b] hover:border-slate-500'
        }`}
      >
        {selectionBox}
        <div className="w-12 h-[4.25rem] rounded-md overflow-hidden bg-[#090a0f] border border-[#262a3b] flex items-center justify-center shrink-0">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-4 h-4 text-slate-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-slate-100 truncate" title={displayName}>{displayName}</h4>
          <div className="mt-1 flex items-center gap-2 min-w-0">
            <span className="text-[0.7rem] text-slate-500 shrink-0">{localDate}</span>
            {badge}
          </div>
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div
      data-testid={`page-card-${job.id}`}
      onClick={onToggleSelect}
      onDoubleClick={onOpen}
      className={`group relative flex flex-col rounded-xl overflow-hidden border cursor-pointer transition select-none ${
        isActive
          ? 'bg-[#10202f] border-[#60c1e5] ring-1 ring-[#60c1e5]/40'
          : isSelected
          ? 'bg-[#005a9c]/10 border-[#60c1e5]/50'
          : 'bg-[#12141c] border-[#262a3b] hover:border-slate-500'
      }`}
    >
      <div className="relative w-full aspect-[3/4] bg-[#090a0f] flex items-center justify-center overflow-hidden">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-7 h-7 text-slate-600" />
        )}
        <div className="absolute top-2 left-2">{selectionBox}</div>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          {actions}
        </div>
      </div>
      <div className="p-2.5 bg-[#12141c] border-t border-[#262a3b]">
        <h4 className="text-xs font-semibold text-slate-100 truncate" title={displayName}>{displayName}</h4>
        <div className="mt-1 flex items-center justify-between gap-2 min-w-0">
          <span className="text-[0.65rem] text-slate-500 shrink-0">{localDate}</span>
          {badge}
        </div>
      </div>
    </div>
  );
};
