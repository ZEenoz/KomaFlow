import React, { useMemo, useState } from 'react';
import type { ProjectFolder, TranslationJob } from '../../db';
import {
  filterAndSortJobs,
  filterAndSortProjects,
  getJobDisplayName,
  type HistoryDatePreset,
  type HistorySortOrder,
  type LibraryViewTab,
} from '../state/historyFilter';
import { LibraryToolbar } from './LibraryToolbar';
import { LibraryEmptyState } from './LibraryEmptyState';
import { LibraryFooterBar } from './LibraryFooterBar';
import { LibraryGridSections } from './LibraryGridSections';
import { DEFAULT_TILE_SIZE_REM } from './libraryViewConstants';

/** Props for the unified projects and translated-pages library grid. */
export interface ProjectsGridProps {
  /** All project folders. */
  projects: ProjectFolder[];
  /** All translation jobs. */
  jobs: TranslationJob[];
  /** Currently inspected project. */
  selectedProjectId: number | null;
  /** Currently inspected page. */
  selectedJobId: number | null;
  /** Top-level library tab. */
  activeTab: LibraryViewTab;
  /** Changes the top-level tab. */
  onTabChange: (tab: LibraryViewTab) => void;
  /** Date window preset. */
  datePreset: HistoryDatePreset;
  /** Changes the date window. */
  onDatePresetChange: (preset: HistoryDatePreset) => void;
  /** Local ISO date for the custom window. */
  customDate: string;
  /** Updates the custom date. */
  onCustomDateChange: (date: string) => void;
  /** Chronological order. */
  sortOrder: HistorySortOrder;
  /** Changes chronological order. */
  onSortOrderChange: (order: HistorySortOrder) => void;
  /** Grid or list presentation. */
  layoutMode: 'grid' | 'list';
  /** Changes presentation density. */
  onLayoutModeChange: (mode: 'grid' | 'list') => void;
  /** Multi-selected project IDs. */
  selectedProjectIds: Set<number>;
  /** Multi-selected page IDs. */
  selectedJobIds: Set<number>;
  /** Toggles project multi-selection. */
  onToggleSelectProject: (projectId: number) => void;
  /** Toggles page multi-selection. */
  onToggleSelectJob: (jobId: number) => void;
  /** Selects a project for the inspector. */
  onSelectProject: (projectId: number) => void;
  /** Opens a project in the editor. */
  onOpenProject: (projectId: number) => void;
  /** Selects a page for the inspector. */
  onSelectJob: (jobId: number) => void;
  /** Opens a page in the Canvas editor. */
  onOpenPage: (jobId: number) => void;
  /** Deletes one page. */
  onDeletePage: (jobId: number) => void;
  /** Clears every multi-selection. */
  onClearSelected: () => void;
  onRenameProject: (projectId: number) => void;
  onDeleteProject: (projectId: number) => void;
  onExportProject: (projectId: number) => void;
  onCreateProject: () => void;
}

/**
 * Renders the unified project and translated-page library with shared filters,
 * tabs, layout controls, and multi-selection.
 *
 * @param props - Library records, filter state, selection, and action callbacks.
 * @returns Main library content area.
 */
export const ProjectsGrid: React.FC<ProjectsGridProps> = ({
  projects,
  jobs,
  selectedProjectId,
  selectedJobId = null,
  activeTab = 'all',
  onTabChange,
  datePreset = 'all',
  onDatePresetChange,
  customDate = '',
  onCustomDateChange,
  sortOrder = 'newest',
  onSortOrderChange,
  layoutMode = 'grid',
  onLayoutModeChange,
  selectedProjectIds = new Set<number>(),
  selectedJobIds = new Set<number>(),
  onToggleSelectProject,
  onToggleSelectJob,
  onSelectProject,
  onOpenProject,
  onSelectJob,
  onOpenPage,
  onDeletePage,
  onClearSelected,
  onRenameProject,
  onDeleteProject,
  onExportProject,
  onCreateProject,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tileSizeRem, setTileSizeRem] = useState(DEFAULT_TILE_SIZE_REM);

  const projectsById = useMemo(
    () => new Map(projects.flatMap((project) => (project.id === undefined ? [] : [[project.id, project] as const]))),
    [projects]
  );
  const query = searchQuery.toLowerCase().trim();

  const filteredProjects = useMemo(() => filterAndSortProjects(projects, {
    datePreset,
    customDate,
    sortOrder,
  }).filter((project) => !query || project.title.toLowerCase().includes(query)), [
    projects,
    datePreset,
    customDate,
    sortOrder,
    query,
  ]);

  const filteredJobs = useMemo(() => filterAndSortJobs(jobs, {
    datePreset,
    customDate,
    sortOrder,
  }).filter((job) => {
    if (!query) return true;
    const projectTitle = job.folderId !== undefined ? projectsById.get(job.folderId)?.title ?? '' : '';
    return [getJobDisplayName(job), job.srcUrl ?? '', job.pageName ?? '', projectTitle]
      .some((value) => value.toLowerCase().includes(query));
  }), [jobs, datePreset, customDate, sortOrder, projectsById, query]);

  const visibleProjects = activeTab === 'pages' ? [] : filteredProjects;
  const visibleJobs = activeTab === 'projects' ? [] : filteredJobs;
  const hasLibrary = projects.length > 0 || jobs.length > 0;
  const hasVisibleItems = visibleProjects.length > 0 || visibleJobs.length > 0;
  const selectedCount = selectedProjectIds.size + selectedJobIds.size;

  return (
    <main className="flex-1 flex flex-col bg-[#090a0f] min-w-0 overflow-hidden select-none">
      <LibraryToolbar
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectCount={filteredProjects.length}
        pageCount={filteredJobs.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        datePreset={datePreset}
        onDatePresetChange={onDatePresetChange}
        customDate={customDate}
        onCustomDateChange={onCustomDateChange}
        sortOrder={sortOrder}
        onSortOrderChange={onSortOrderChange}
        layoutMode={layoutMode}
        onLayoutModeChange={onLayoutModeChange}
        selectedCount={selectedCount}
        onClearSelected={onClearSelected}
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {hasVisibleItems ? (
          <LibraryGridSections
            visibleProjects={visibleProjects}
            visibleJobs={visibleJobs}
            layoutMode={layoutMode}
            tileSizeRem={tileSizeRem}
            selectedProjectId={selectedProjectId}
            selectedJobId={selectedJobId}
            selectedProjectIds={selectedProjectIds}
            selectedJobIds={selectedJobIds}
            projectsById={projectsById}
            onToggleSelectProject={onToggleSelectProject}
            onSelectProject={onSelectProject}
            onOpenProject={onOpenProject}
            onRenameProject={onRenameProject}
            onDeleteProject={onDeleteProject}
            onExportProject={onExportProject}
            onToggleSelectJob={onToggleSelectJob}
            onSelectJob={onSelectJob}
            onOpenPage={onOpenPage}
            onDeletePage={onDeletePage}
          />
        ) : (
          <LibraryEmptyState hasLibrary={hasLibrary} onCreateProject={onCreateProject} />
        )}
      </div>

      <LibraryFooterBar
        tileSizeRem={tileSizeRem}
        onTileSizeChange={setTileSizeRem}
        layoutMode={layoutMode}
        onCreateProject={onCreateProject}
      />
    </main>
  );
};
