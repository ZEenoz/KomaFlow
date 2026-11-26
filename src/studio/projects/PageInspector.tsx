import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ExternalLink,
  Folder,
  FolderPlus,
  History,
  Image as ImageIcon,
  Languages,
  Maximize2,
  Trash2,
} from 'lucide-react';
import type { ProjectFolder, TranslationJob } from '../../db';
import { getTranslatedPageThumbnailUrl } from '../canvas/thumbnailRenderer';
import { formatLocalIsoDate, getJobDisplayName } from '../state/historyFilter';

/** Props for the selected translated-page inspector. */
export interface PageInspectorProps {
  /** Page whose metadata and actions are shown. */
  selectedJob: TranslationJob;
  /** Available project folders for the Add to Project control. */
  projects?: ProjectFolder[];
  /** Opens the page in the Canvas editor. */
  onOpenPage?: (jobId: number) => void;
  /** Deletes the page. */
  onDeletePage?: (jobId: number) => void;
  /** Assigns the page to a project. */
  onAssignPageToProject?: (jobId: number, projectId: number) => void;
}

/**
 * Resolves a compact source label for a job URL.
 *
 * @param job - Translation job to describe.
 * @returns Hostname, local-image label, or the raw URL when malformed.
 */
function getSourceLabel(job: TranslationJob): string {
  const url = job.srcUrl?.trim();
  if (!url) return 'Local upload';
  if (url.startsWith('data:')) return 'Embedded image';
  if (url.startsWith('blob:')) return 'Local image';
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/**
 * Renders translated-page metadata, preview, and Canvas/project actions.
 *
 * @param props - Selected page, project list, and action callbacks.
 * @returns Page inspector sidebar.
 */
export const PageInspector: React.FC<PageInspectorProps> = ({
  selectedJob,
  projects = [],
  onOpenPage,
  onDeletePage,
  onAssignPageToProject,
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setThumbUrl(null);
    setTargetProjectId(null);
    if (selectedJob.id === undefined) return;

    void getTranslatedPageThumbnailUrl(selectedJob.id, 600)
      .then((url) => {
        if (!isCancelled) setThumbUrl(url);
      })
      .catch((err) => {
        console.warn('[PageInspector] Failed loading page thumbnail:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedJob.id]);

  const linkedProject = selectedJob.folderId !== undefined
    ? projects.find((project) => project.id === selectedJob.folderId) ?? null
    : null;
  const assignableProjects = projects.filter((project) => (
    project.id !== undefined && project.id !== selectedJob.folderId
  ));
  const canOpen = selectedJob.id !== undefined && onOpenPage !== undefined;
  const canDelete = selectedJob.id !== undefined && onDeletePage !== undefined;
  const canAssign = selectedJob.id !== undefined
    && targetProjectId !== null
    && onAssignPageToProject !== undefined;

  return (
    <aside className="w-80 bg-[#12141c] border-l border-[#262a3b] flex flex-col justify-between p-4 overflow-y-auto select-none shrink-0">
      <div className="flex flex-col gap-4">
        <span className="text-[0.65rem] uppercase font-bold tracking-wider text-slate-400">Page Inspector</span>

        <div className="relative w-full h-48 rounded-xl overflow-hidden bg-[#161924] border border-[#262a3b] flex items-center justify-center shadow-inner">
          {thumbUrl ? (
            <img src={thumbUrl} alt="Translated page preview" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center text-slate-500 text-xs gap-1">
              <ImageIcon className="w-8 h-8 opacity-40 text-slate-600" />
              <span>No preview available</span>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-100 truncate" title={getJobDisplayName(selectedJob)}>
            {getJobDisplayName(selectedJob)}
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <Calendar className="w-3 h-3" />
            <span>{formatLocalIsoDate(selectedJob.timestamp)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-[#161924] border border-[#262a3b] text-xs text-slate-400">
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-1.5 shrink-0">
              <ExternalLink className="w-3.5 h-3.5 text-[#60c1e5]" />
              <span>Source</span>
            </span>
            <span className="text-right min-w-0">
              <span className="block text-slate-200 font-medium truncate">{getSourceLabel(selectedJob)}</span>
              {selectedJob.srcUrl && (
                <span className="block text-[0.65rem] text-slate-500 truncate" title={selectedJob.srcUrl}>
                  {selectedJob.srcUrl}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-[#60c1e5]" />
              <span>Target Language</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase bg-[#005a9c]/15 text-[#60c1e5] border border-[#60c1e5]/30">
              {selectedJob.targetLang || 'Auto'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 shrink-0">
              {linkedProject ? <Folder className="w-3.5 h-3.5 text-[#60c1e5]" /> : <History className="w-3.5 h-3.5 text-slate-500" />}
              <span>Project</span>
            </span>
            <span className={`truncate font-medium ${linkedProject ? 'text-[#60c1e5]' : 'text-slate-300'}`}>
              {linkedProject?.title ?? 'Unassigned History'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#161924] border border-[#262a3b]">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <FolderPlus className="w-3.5 h-3.5 text-[#60c1e5]" />
            <span>Add to Project</span>
          </span>
          <select
            aria-label="Add page to project"
            value={targetProjectId ?? ''}
            onChange={(event) => setTargetProjectId(event.target.value ? Number(event.target.value) : null)}
            disabled={assignableProjects.length === 0}
            className="w-full h-8 px-2 rounded-lg bg-[#090a0f] border border-[#262a3b] text-slate-300 text-xs focus:outline-none focus:border-[#60c1e5] disabled:opacity-40"
          >
            <option value="">{assignableProjects.length === 0 ? 'No other projects' : 'Choose a project...'}</option>
            {assignableProjects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!canAssign}
            onClick={() => {
              if (selectedJob.id !== undefined && targetProjectId !== null) {
                onAssignPageToProject?.(selectedJob.id, targetProjectId);
                setTargetProjectId(null);
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#005a9c] hover:bg-[#1b365d] disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold transition cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Add to Project</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-4 border-t border-[#262a3b]">
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => selectedJob.id !== undefined && onOpenPage?.(selectedJob.id)}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#005a9c] hover:bg-[#1b365d] disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold shadow-md shadow-[rgba(0,90,156,0.25)] transition cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" />
          <span>Open in Canvas Editor</span>
        </button>

        <button
          type="button"
          disabled={!canDelete}
          onClick={() => selectedJob.id !== undefined && onDeletePage?.(selectedJob.id)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:pointer-events-none text-red-300 text-xs font-semibold transition border border-red-500/25 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Page</span>
        </button>
      </div>
    </aside>
  );
};
