import React from 'react';
import { Layers } from 'lucide-react';
import type { ProjectFolder, TranslationJob } from '../../db';
import type { BatchExportFormat } from '../export/batchExport';
import { PageInspector } from './PageInspector';
import { ProjectInspector } from './ProjectInspector';

/** Props for the right-hand library details pane. */
export interface ProjectDetailsPaneProps {
  /** Selected project, or null when a page or nothing is selected. */
  project: ProjectFolder | null;
  /** Selected translated page shown when no project is selected. */
  selectedJob?: TranslationJob | null;
  /** Available projects for assigning the selected page. */
  projects?: ProjectFolder[];
  /** Opens the selected page in the Canvas editor. */
  onOpenPage?: (jobId: number) => void;
  /** Deletes the selected page. */
  onDeletePage?: (jobId: number) => void;
  /** Assigns the selected page to a project. */
  onAssignPageToProject?: (jobId: number, projectId: number) => void;
  /** Opens the selected project in Studio. */
  onOpenStudio: () => void;
  /** Opens the add-pages-from-library dialog. */
  onAddFromLibrary: () => void;
  /** Starts a project batch export. */
  onBatchExport: (format: BatchExportFormat) => void;
}

/**
 * Chooses between the project inspector, page inspector, and empty state.
 *
 * @param props - Selected records and action callbacks.
 * @returns Right-hand library sidebar.
 */
export const ProjectDetailsPane: React.FC<ProjectDetailsPaneProps> = ({
  project,
  selectedJob,
  projects,
  onOpenPage,
  onDeletePage,
  onAssignPageToProject,
  onOpenStudio,
  onAddFromLibrary,
  onBatchExport,
}) => {
  if (project) {
    return (
      <ProjectInspector
        project={project}
        onOpenStudio={onOpenStudio}
        onAddFromLibrary={onAddFromLibrary}
        onBatchExport={onBatchExport}
      />
    );
  }

  if (selectedJob) {
    return (
      <PageInspector
        selectedJob={selectedJob}
        projects={projects}
        onOpenPage={onOpenPage}
        onDeletePage={onDeletePage}
        onAssignPageToProject={onAssignPageToProject}
      />
    );
  }

  return (
    <aside className="w-80 bg-[#12141c] border-l border-[#262a3b] flex flex-col items-center justify-center p-6 text-center select-none shrink-0">
      <div className="w-12 h-12 rounded-2xl bg-[#161924] border border-[#262a3b] flex items-center justify-center text-slate-500 mb-3 shadow-inner">
        <Layers className="w-6 h-6 text-[#60c1e5]/40" />
      </div>
      <h4 className="text-sm font-semibold text-slate-300">No project or page selected</h4>
      <p className="text-xs text-slate-500 mt-1 max-w-[200px] leading-relaxed">
        Select a project to inspect its translation progress, or select a page to open it in Canvas.
      </p>
    </aside>
  );
};
