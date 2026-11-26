import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
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

/** Props for the History tab inside the Canvas page rail. */
export interface PageRailHistoryListProps {
  /** Preloaded history jobs; the rail queries IndexedDB when omitted. */
  allJobs?: TranslationJob[];
  /** Projects offered by the quick assignment selector. */
  projects?: ProjectFolder[];
  /** Page currently open in the canvas. */
  activeJobId?: number;
  /** Forces a reload after library mutations. */
  refreshKey?: number;
  /** Single-column strip or two-column flex grid. */
  layoutMode: HistoryLayoutMode;
  /** Changes the history card density. */
  onLayoutModeChange: (mode: HistoryLayoutMode) => void;
  /** Opens a history page in the canvas editor. */
  onSelectPage: (jobId: number) => void;
  /** Assigns a history page to a project from the rail. */
  onAssignPageToProject?: (jobId: number, projectId: number) => void;
}

/**
 * Renders the searchable-by-filter history page list with date, order, scope,
 * and density controls.
 *
 * @param props - History data source, filters, layout state, and action callbacks.
 * @returns History toolbar plus the filtered page cards.
 */
export const PageRailHistoryList: React.FC<PageRailHistoryListProps> = ({
  allJobs,
  projects,
  activeJobId,
  refreshKey = 0,
  layoutMode,
  onLayoutModeChange,
  onSelectPage,
  onAssignPageToProject,
}) => {
  const [jobs, setJobs] = useState<TranslationJob[]>(allJobs ?? []);
  const [isLoading, setIsLoading] = useState(allJobs === undefined);
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('all');
  const [customDate, setCustomDate] = useState('');
  const [sortOrder, setSortOrder] = useState<HistorySortOrder>('newest');
  const [scope, setScope] = useState<HistoryScopeFilter>('all');

  useEffect(() => {
    let isCancelled = false;

    if (allJobs) {
      setJobs(allJobs);
      setIsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    setIsLoading(true);
    void db.translationJobs
      .orderBy('timestamp')
      .reverse()
      .toArray()
      .then((rows) => {
        if (!isCancelled) setJobs(rows);
      })
      .catch((err) => {
        console.warn('[PageRailHistoryList] Failed loading history:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [allJobs, refreshKey]);

  const filteredJobs = useMemo(
    () => filterAndSortJobs(jobs, { datePreset, customDate, sortOrder, scope }),
    [jobs, datePreset, customDate, sortOrder, scope]
  );

  const canAssign = projects !== undefined && projects.length > 0 && onAssignPageToProject !== undefined;
  const listClass = layoutMode === 'grid'
    ? 'flex flex-wrap gap-2'
    : 'flex flex-col gap-2';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-2 py-1.5 border-b border-[#262a3b] shrink-0">
        <HistoryFilterControls
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          scope={scope}
          onScopeChange={setScope}
          layoutMode={layoutMode}
          onLayoutModeChange={onLayoutModeChange}
        />
      </div>

      <div
        data-testid="rail-history-list"
        data-layout={layoutMode}
        className={`flex-1 min-h-0 overflow-y-auto p-2 ${listClass}`}
      >
        {filteredJobs.map((job) => {
          if (job.id === undefined) return null;
          const isActive = job.id === activeJobId;
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
                data-testid={`rail-history-page-${job.id}`}
                data-job-id={job.id}
                onClick={() => onSelectPage(job.id!)}
                className={`flex flex-col gap-1 w-[calc(50%-0.25rem)] p-1 rounded-lg border cursor-pointer transition ${
                  isActive
                    ? 'bg-[#005a9c]/15 border-[#60c1e5] ring-1 ring-[#60c1e5]/30'
                    : 'bg-[#161924] border-[#262a3b] hover:border-slate-500'
                }`}
              >
                <HistoryPageThumbnail jobId={job.id} className="w-full aspect-[3/4]" iconClassName="w-4 h-4 text-slate-600" />
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[0.65rem] font-semibold text-slate-200 truncate flex-1" title={displayName}>
                    {displayName}
                  </span>
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
              data-testid={`rail-history-page-${job.id}`}
              data-job-id={job.id}
              onClick={() => onSelectPage(job.id!)}
              className={`group flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer transition ${
                isActive
                  ? 'bg-[#005a9c]/15 border-[#60c1e5] ring-1 ring-[#60c1e5]/30 shadow-sm'
                  : 'bg-[#161924] border-[#262a3b] hover:border-slate-500'
              }`}
            >
              <HistoryPageThumbnail jobId={job.id} className="w-10 h-14" />
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-200">
                  <span className="truncate" title={displayName}>{displayName}</span>
                  {statusIcon}
                </div>
                <span className="text-[0.6rem] text-slate-500 mt-0.5">{formatLocalIsoDate(job.timestamp)}</span>
                {assignSelect}
              </div>
            </div>
          );
        })}

        {!isLoading && filteredJobs.length === 0 && (
          <p className="w-full text-center text-[0.65rem] text-slate-500 py-4">
            No history pages match these filters.
          </p>
        )}
      </div>
    </div>
  );
};
