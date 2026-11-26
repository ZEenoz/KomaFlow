import React from 'react';
import { Check, Folder, Image as ImageIcon } from 'lucide-react';
import type { ProjectFolder, TranslationJob } from '../../db';
import { formatLocalIsoDate, getJobDisplayName } from '../state/historyFilter';

/** Bytes in one mebibyte used by the compact size labels. */
const BYTES_PER_MB = 1024 * 1024;

/** Props for the grouped Clear Library checklist. */
export interface ClearLibraryChecklistProps {
  /** Projects matching the current search query. */
  projects: ProjectFolder[];
  /** Pages matching the current search query. */
  jobs: TranslationJob[];
  /** Lookup used to label linked pages with their project title. */
  projectsById: Map<number, ProjectFolder>;
  /** Page counts keyed by project ID. */
  pageCountByProjectId: Record<number, number>;
  /** Stored bytes keyed by project ID. */
  projectBytesById: Record<number, number>;
  /** Stored bytes keyed by job ID. */
  jobBytesById: Record<number, number>;
  /** Selected project IDs. */
  selectedProjectIds: Set<number>;
  /** Selected job IDs. */
  selectedJobIds: Set<number>;
  /** Toggles one project row. */
  onToggleProject: (projectId: number) => void;
  /** Toggles one translated-page row. */
  onToggleJob: (jobId: number) => void;
}

/**
 * Renders one accessible checkbox-style row.
 *
 * @param props - Row label, selection state, and toggle callback.
 * @returns Checkbox row button.
 */
const ChecklistRow: React.FC<{
  label: string;
  ariaLabel: string;
  meta: string;
  checked: boolean;
  icon: React.ReactNode;
  onToggle: () => void;
}> = ({ label, ariaLabel, meta, checked, icon, onToggle }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={onToggle}
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
      checked
        ? 'bg-[#005a9c]/15 border-[#60c1e5]/50 text-slate-100'
        : 'bg-[#090a0f] border-[#262a3b] hover:bg-[#161924] text-slate-300'
    }`}
  >
    <span
      aria-hidden="true"
      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
        checked ? 'bg-[#005a9c] border-[#60c1e5] text-white' : 'border-[#3a4055] text-transparent'
      }`}
    >
      <Check className="w-3 h-3" />
    </span>
    <span className="text-[#60c1e5] shrink-0">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-xs font-medium truncate">{label}</span>
      <span className="block text-[0.65rem] text-slate-500 truncate">{meta}</span>
    </span>
  </button>
);

/**
 * Renders grouped project and translated-page checklists for custom clearing.
 *
 * @param props - Visible rows, byte totals, selection sets, and toggle callbacks.
 * @returns Scrollable grouped checklist.
 */
export const ClearLibraryChecklist: React.FC<ClearLibraryChecklistProps> = ({
  projects,
  jobs,
  projectsById,
  pageCountByProjectId,
  projectBytesById,
  jobBytesById,
  selectedProjectIds,
  selectedJobIds,
  onToggleProject,
  onToggleJob,
}) => (
  <div className="flex flex-col gap-4" data-testid="clear-library-checklist">
    <section className="flex flex-col gap-1.5">
      <h4 className="flex items-center justify-between text-[0.65rem] uppercase font-bold tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5">
          <Folder className="w-3 h-3" /> Projects
        </span>
        <span className="text-slate-500 normal-case font-medium">{projects.length}</span>
      </h4>
      {projects.length > 0 ? projects.map((project) => (
        <ChecklistRow
          key={project.id}
          label={project.title}
          ariaLabel={`Select project ${project.title}`}
          meta={`${pageCountByProjectId[project.id ?? -1] ?? 0} pages · ${((projectBytesById[project.id ?? -1] ?? 0) / BYTES_PER_MB).toFixed(1)} MB`}
          checked={project.id !== undefined && selectedProjectIds.has(project.id)}
          icon={<Folder className="w-3.5 h-3.5" />}
          onToggle={() => project.id !== undefined && onToggleProject(project.id)}
        />
      )) : <p className="px-1 text-[0.7rem] text-slate-500">No projects match.</p>}
    </section>

    <section className="flex flex-col gap-1.5">
      <h4 className="flex items-center justify-between text-[0.65rem] uppercase font-bold tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3" /> Translated Pages
        </span>
        <span className="text-slate-500 normal-case font-medium">{jobs.length}</span>
      </h4>
      {jobs.length > 0 ? jobs.map((job) => {
        const linkedProject = job.folderId !== undefined ? projectsById.get(job.folderId) : undefined;
        return (
          <ChecklistRow
            key={job.id}
            label={getJobDisplayName(job)}
            ariaLabel={`Select page ${getJobDisplayName(job)}`}
            meta={`${formatLocalIsoDate(job.timestamp)} · ${linkedProject?.title ?? 'History'} · ${((jobBytesById[job.id ?? -1] ?? 0) / BYTES_PER_MB).toFixed(1)} MB`}
            checked={job.id !== undefined && selectedJobIds.has(job.id)}
            icon={<ImageIcon className="w-3.5 h-3.5" />}
            onToggle={() => job.id !== undefined && onToggleJob(job.id)}
          />
        );
      }) : <p className="px-1 text-[0.7rem] text-slate-500">No translated pages match.</p>}
    </section>
  </div>
);
