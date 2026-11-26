import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Clock } from 'lucide-react';
import { db, type ProjectFolder, type TranslationJob } from '../../db';
import {
  filterAndSortJobs,
  formatLocalIsoDate,
  getJobDisplayName,
  type HistoryDatePreset,
  type HistoryLayoutMode,
  type HistoryScopeFilter,
  type HistorySortOrder,
} from '../state/historyFilter';
import { HistoryFilterControls } from './HistoryFilterControls';
import { HistoryPageThumbnail } from './HistoryPageThumbnail';

/** Props for the Canvas topbar History Pages popover. */
export interface HistoryPagesDropdownProps {
  /** Preloaded history jobs; the popover queries IndexedDB when omitted. */
  jobs?: TranslationJob[];
  /** Projects offered by the quick assignment selector. */
  projects?: ProjectFolder[];
  /** Page currently open in the canvas. */
  activeJobId?: number;
  /** Forces a reload after library mutations. */
  refreshKey?: number;
  /** Opens a page and closes the popover. */
  onSelectPage: (jobId: number) => void;
  /** Assigns a page to a project without leaving the canvas. */
  onAssignPageToProject?: (jobId: number, projectId: number) => void;
}

/**
 * Renders the compact topbar history browser with search, date, sort, scope,
 * density, quick project assignment, and direct page opening.
 *
 * @param props - History data, selection, and action callbacks.
 * @returns Toggle button plus the anchored popover panel.
 */
export const HistoryPagesDropdown: React.FC<HistoryPagesDropdownProps> = ({
  jobs,
  projects,
  activeJobId,
  refreshKey = 0,
  onSelectPage,
  onAssignPageToProject,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceJobs, setSourceJobs] = useState<TranslationJob[]>(jobs ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('all');
  const [customDate, setCustomDate] = useState('');
  const [sortOrder, setSortOrder] = useState<HistorySortOrder>('newest');
  const [scope, setScope] = useState<HistoryScopeFilter>('all');
  const [layoutMode, setLayoutMode] = useState<HistoryLayoutMode>('strip');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isCancelled = false;
    if (jobs) {
      setSourceJobs(jobs);
      return () => {
        isCancelled = true;
      };
    }
    void db.translationJobs.orderBy('timestamp').reverse().toArray().then((rows) => {
      if (!isCancelled) setSourceJobs(rows);
    }).catch((err) => {
      console.warn('[HistoryPagesDropdown] Failed loading history:', err);
    });
    return () => {
      isCancelled = true;
    };
  }, [jobs, refreshKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const projectsById = useMemo(
    () => new Map(projects?.flatMap((project) => (
      project.id === undefined ? [] : [[project.id, project] as const]
    )) ?? []),
    [projects]
  );

  const filteredJobs = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return filterAndSortJobs(sourceJobs, { datePreset, customDate, sortOrder, scope })
      .filter((job) => {
        if (!query) return true;
        const projectTitle = job.folderId !== undefined ? projectsById.get(job.folderId)?.title ?? '' : '';
        return [getJobDisplayName(job), job.pageName ?? '', projectTitle]
          .some((value) => value.toLowerCase().includes(query));
      });
  }, [sourceJobs, datePreset, customDate, sortOrder, scope, searchQuery, projectsById]);

  const canAssign = projects !== undefined && projects.length > 0 && onAssignPageToProject !== undefined;

  const openPage = (jobId: number) => {
    setIsOpen(false);
    onSelectPage(jobId);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Browse history pages"
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#090a0f] border border-[#262a3b] text-slate-300 hover:text-white hover:bg-[#1c1f2e] text-xs font-semibold transition cursor-pointer whitespace-nowrap"
      >
        <span>History Pages ({sourceJobs.length})</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="History Pages"
          className="absolute top-full left-0 mt-1.5 w-[30rem] max-w-[calc(100vw-2rem)] max-h-[72vh] rounded-xl border border-[#262a3b] bg-[#12141c] shadow-2xl z-50 flex flex-col overflow-hidden"
        >
          <div className="p-2 border-b border-[#262a3b] shrink-0">
            <HistoryFilterControls
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              datePreset={datePreset}
              onDatePresetChange={setDatePreset}
              customDate={customDate}
              onCustomDateChange={setCustomDate}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
              scope={scope}
              onScopeChange={setScope}
              layoutMode={layoutMode}
              onLayoutModeChange={setLayoutMode}
            />
          </div>

          <div
            data-testid="history-pages-dropdown-list"
            data-layout={layoutMode}
            className={`flex-1 min-h-0 overflow-y-auto p-2 ${
              layoutMode === 'grid' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-1.5'
            }`}
          >
            {filteredJobs.map((job) => {
              if (job.id === undefined) return null;
              const displayName = getJobDisplayName(job);
              const statusIcon = job.status === 'completed' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : job.status === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              );
              const assignSelect = canAssign ? (
                <select
                  aria-label={`Assign ${displayName} to project`}
                  value=""
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const projectId = Number(event.target.value);
                    if (projectId) onAssignPageToProject!(job.id!, projectId);
                  }}
                  className="h-5 max-w-full px-1 rounded bg-[#090a0f] border border-[#262a3b] text-slate-400 text-[0.6rem] cursor-pointer"
                >
                  <option value="">+ Project</option>
                  {projects!.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              ) : null;

              if (layoutMode === 'grid') {
                return (
                  <div
                    key={job.id}
                    data-testid={`history-page-${job.id}`}
                    onClick={() => openPage(job.id!)}
                    className={`flex flex-col gap-1 w-[calc(50%-0.25rem)] p-1 rounded-lg border cursor-pointer transition ${
                      job.id === activeJobId
                        ? 'bg-[#005a9c]/15 border-[#60c1e5] ring-1 ring-[#60c1e5]/30'
                        : 'bg-[#161924] border-[#262a3b] hover:border-slate-500'
                    }`}
                  >
                    <HistoryPageThumbnail jobId={job.id} className="w-full aspect-[3/4]" iconClassName="w-5 h-5 text-slate-600" />
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[0.65rem] font-semibold text-slate-200 truncate flex-1" title={displayName}>{displayName}</span>
                      {statusIcon}
                    </div>
                    <span className="text-[0.6rem] text-slate-500">{formatLocalIsoDate(job.timestamp)}</span>
                    {assignSelect}
                  </div>
                );
              }

              return (
                <div
                  key={job.id}
                  data-testid={`history-page-${job.id}`}
                  onClick={() => openPage(job.id!)}
                  className={`flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer transition ${
                    job.id === activeJobId
                      ? 'bg-[#005a9c]/15 border-[#60c1e5] ring-1 ring-[#60c1e5]/30'
                      : 'bg-[#161924] border-[#262a3b] hover:border-slate-500'
                  }`}
                >
                  <HistoryPageThumbnail jobId={job.id} className="w-9 h-12" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-200">
                      <span className="truncate" title={displayName}>{displayName}</span>
                      {statusIcon}
                    </div>
                    <span className="text-[0.6rem] text-slate-500">{formatLocalIsoDate(job.timestamp)}</span>
                  </div>
                  {assignSelect}
                </div>
              );
            })}

            {filteredJobs.length === 0 && (
              <p className="w-full text-center text-xs text-slate-500 py-6">No history pages match these filters.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
