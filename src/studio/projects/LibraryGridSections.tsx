import React from 'react';
import { Check } from 'lucide-react';
import type { ProjectFolder, TranslationJob } from '../../db';
import { ProjectCard } from './ProjectCard';
import { PageCard } from './PageCard';

/** Props for the filtered project and translated-page result sections. */
export interface LibraryGridSectionsProps {
  /** Projects visible after tab, date, and search filtering. */
  visibleProjects: ProjectFolder[];
  /** Pages visible after tab, date, and search filtering. */
  visibleJobs: TranslationJob[];
  /** Grid or list presentation. */
  layoutMode: 'grid' | 'list';
  /** Thumbnail size for project preview strips. */
  tileSizeRem: number;
  /** Currently inspected project. */
  selectedProjectId: number | null;
  /** Currently inspected page. */
  selectedJobId: number | null;
  /** Multi-selected project IDs. */
  selectedProjectIds: Set<number>;
  /** Multi-selected page IDs. */
  selectedJobIds: Set<number>;
  /** Project lookup for page badges. */
  projectsById: Map<number, ProjectFolder>;
  /** Toggles project multi-selection. */
  onToggleSelectProject: (projectId: number) => void;
  /** Selects a project for the inspector. */
  onSelectProject: (projectId: number) => void;
  /** Opens a project in the editor. */
  onOpenProject: (projectId: number) => void;
  /** Opens the rename dialog. */
  onRenameProject: (projectId: number) => void;
  /** Opens the delete confirmation. */
  onDeleteProject: (projectId: number) => void;
  /** Exports a project. */
  onExportProject: (projectId: number) => void;
  /** Toggles page multi-selection. */
  onToggleSelectJob: (jobId: number) => void;
  /** Selects a page for the inspector. */
  onSelectJob: (jobId: number) => void;
  /** Opens a page in Canvas. */
  onOpenPage: (jobId: number) => void;
  /** Deletes one page. */
  onDeletePage: (jobId: number) => void;
}

/**
 * Renders the project cards and translated-page cards that pass the filters.
 *
 * @param props - Visible records, selection, layout, and action callbacks.
 * @returns Grouped result sections.
 */
export const LibraryGridSections: React.FC<LibraryGridSectionsProps> = ({
  visibleProjects,
  visibleJobs,
  layoutMode,
  tileSizeRem,
  selectedProjectId,
  selectedJobId,
  selectedProjectIds,
  selectedJobIds,
  projectsById,
  onToggleSelectProject,
  onSelectProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onExportProject,
  onToggleSelectJob,
  onSelectJob,
  onOpenPage,
  onDeletePage,
}) => {
  const minColumnPx = Math.max(220, Math.round(tileSizeRem * 34));
  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnPx}px, 1fr))`,
  };
  const projectContainerClass = layoutMode === 'grid' ? 'grid gap-4' : 'flex flex-col gap-2';
  const pageContainerClass = layoutMode === 'grid'
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3'
    : 'flex flex-col gap-2';

  return (
    <>
      {visibleProjects.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[0.65rem] uppercase font-bold tracking-wider text-slate-400">
            Projects · {visibleProjects.length}
          </h2>
          <div className={projectContainerClass} style={layoutMode === 'grid' ? gridStyle : undefined}>
            {visibleProjects.map((project) => {
              if (project.id === undefined) return null;
              const isMultiSelected = selectedProjectIds.has(project.id);
              return (
                <div key={project.id} className="relative">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isMultiSelected}
                    aria-label={`Select project ${project.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSelectProject(project.id!);
                    }}
                    className={`absolute top-3 left-3 z-20 w-5 h-5 rounded-md border flex items-center justify-center transition cursor-pointer ${
                      isMultiSelected
                        ? 'bg-[#005a9c] border-[#60c1e5] text-white'
                        : 'bg-[#090a0f]/80 border-[#3a4055] text-transparent hover:border-slate-400'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <ProjectCard
                    project={project}
                    isSelected={selectedProjectId === project.id || isMultiSelected}
                    tileSizeRem={tileSizeRem}
                    onSelect={() => onSelectProject(project.id!)}
                    onOpen={() => onOpenProject(project.id!)}
                    onRename={() => onRenameProject(project.id!)}
                    onDelete={() => onDeleteProject(project.id!)}
                    onExport={() => onExportProject(project.id!)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {visibleJobs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[0.65rem] uppercase font-bold tracking-wider text-slate-400">
            Translated Pages · {visibleJobs.length}
          </h2>
          <div className={pageContainerClass}>
            {visibleJobs.map((job) => {
              if (job.id === undefined) return null;
              return (
                <PageCard
                  key={job.id}
                  job={job}
                  layoutMode={layoutMode}
                  isSelected={selectedJobIds.has(job.id)}
                  isActive={selectedJobId === job.id}
                  project={job.folderId !== undefined ? projectsById.get(job.folderId) ?? null : null}
                  onToggleSelect={() => {
                    onToggleSelectJob(job.id!);
                    onSelectJob(job.id!);
                  }}
                  onOpen={() => onOpenPage(job.id!)}
                  onDelete={() => onDeletePage(job.id!)}
                />
              );
            })}
          </div>
        </section>
      )}
    </>
  );
};
