import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileCode,
  FileText,
  Layers,
} from 'lucide-react';
import { db, type ProjectFolder, type TranslationJob } from '../../db';
import type { BatchExportFormat } from '../export/batchExport';
import { getJobDisplayName } from '../state/historyFilter';
import { HistoryPageThumbnail } from './HistoryPageThumbnail';

/** Props for the Project tab inside the Canvas page rail. */
export interface PageRailProjectListProps {
  /** Project whose ordered pages are shown. */
  projectId: number;
  /** Page currently open in the canvas. */
  activeJobId?: number;
  /** Forces a reload after library mutations. */
  refreshKey?: number;
  /** Opens a project page in the canvas editor. */
  onSelectPage: (jobId: number) => void;
  /** Opens the add-pages-from-library dialog for this project. */
  onOpenAddFromLibrary?: () => void;
}

/**
 * Renders the ordered pages of the active project plus its export bar.
 *
 * @param props - Active project, selection, and action callbacks.
 * @returns Project page list and export controls.
 */
export const PageRailProjectList: React.FC<PageRailProjectListProps> = ({
  projectId,
  activeJobId,
  refreshKey = 0,
  onSelectPage,
  onOpenAddFromLibrary,
}) => {
  const [pages, setPages] = useState<TranslationJob[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    void db.translationJobs
      .where('folderId')
      .equals(projectId)
      .sortBy('projectOrder')
      .then((jobs) => {
        if (!isCancelled) setPages(jobs);
      })
      .catch((err) => {
        console.warn('[PageRailProjectList] Failed loading project pages:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId, refreshKey]);

  const handleExport = async (format: BatchExportFormat) => {
    setExportMenuOpen(false);
    setIsExporting(true);
    try {
      const { exportProjectBundle } = await import('../export/batchExport');
      await exportProjectBundle(projectId, format);
    } catch (err) {
      console.error('[PageRailProjectList] Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {pages.map((job) => {
          if (job.id === undefined) return null;
          const isActive = job.id === activeJobId;
          const displayName = getJobDisplayName(job);

          return (
            <div
              key={job.id}
              onClick={() => onSelectPage(job.id!)}
              className={`group relative flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer transition ${
                isActive
                  ? 'bg-[#005a9c]/15 border-[#60c1e5] ring-1 ring-[#60c1e5]/30 shadow-sm'
                  : 'bg-[#161924] border-[#262a3b] hover:border-slate-500'
              }`}
            >
              <HistoryPageThumbnail jobId={job.id} className="w-10 h-14" />
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-200">
                  <span className="truncate" title={displayName}>{displayName}</span>
                  {job.status === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : job.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                </div>
                <span className="text-[0.65rem] text-slate-500 truncate mt-0.5">#{job.id}</span>
              </div>
            </div>
          );
        })}

        {pages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-slate-500">
            <Layers className="w-6 h-6 mb-1 opacity-40 text-slate-600" />
            <span>No pages in this project.</span>
            {onOpenAddFromLibrary && (
              <button
                type="button"
                onClick={onOpenAddFromLibrary}
                className="mt-2 text-xs text-[#60c1e5] hover:underline font-semibold cursor-pointer"
              >
                + Add pages
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-[#262a3b] bg-[#141724] relative shrink-0">
        <button
          type="button"
          disabled={pages.length === 0 || isExporting}
          onClick={() => setExportMenuOpen((value) => !value)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-semibold rounded-lg bg-[#181a26] hover:bg-[#202436] disabled:opacity-40 text-slate-200 transition border border-[#262a3b] cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>{isExporting ? 'Exporting...' : 'Export All'}</span>
        </button>

        {exportMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-[#161924] border border-[#262a3b] rounded-lg shadow-xl z-50 py-1 text-xs text-slate-200">
            <button
              type="button"
              onClick={() => handleExport('images')}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#262a3b] transition text-left cursor-pointer"
            >
              <Download className="w-3 h-3 text-[#60c1e5]" />
              <span>Standard ZIP</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('cbz')}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#262a3b] transition text-left cursor-pointer"
            >
              <FileText className="w-3 h-3 text-emerald-400" />
              <span>Comic CBZ</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('psd')}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#262a3b] transition text-left cursor-pointer"
            >
              <FileCode className="w-3 h-3 text-[#60c1e5]" />
              <span>Layered PSD</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Renders the project picker shown when the Project tab has no active project.
 *
 * @param props - Available projects and picker callbacks.
 * @returns Hint, project buttons, and a switch-to-history action.
 */
export const PageRailProjectPicker: React.FC<{
  projects: ProjectFolder[];
  onSelectProject?: (projectId: number) => void;
  onBrowseHistory: () => void;
}> = ({ projects, onSelectProject, onBrowseHistory }) => (
  <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2">
    <p className="text-[0.65rem] text-slate-500">
      No active project. Pick one to see its pages, or browse History.
    </p>
    {onSelectProject && projects.map((project) => (
      <button
        key={project.id}
        type="button"
        onClick={() => project.id !== undefined && onSelectProject(project.id)}
        className="w-full text-left px-2 py-1.5 rounded-lg bg-[#161924] border border-[#262a3b] text-xs text-slate-200 hover:border-slate-500 transition cursor-pointer truncate"
        title={project.title}
      >
        {project.title}
      </button>
    ))}
    <button
      type="button"
      onClick={onBrowseHistory}
      className="mt-1 text-xs text-[#60c1e5] hover:underline font-semibold cursor-pointer text-left"
    >
      Browse History
    </button>
  </div>
);
