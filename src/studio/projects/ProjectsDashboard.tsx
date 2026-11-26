import React from 'react';
import type { ClearLibraryMode, ClearLibraryResult } from '../state/projectStore';
import { ClearLibraryModal } from '../modals/ClearLibraryModal';
import { LibrarySidebar } from './LibrarySidebar';
import { ProjectsGrid } from './ProjectsGrid';
import { ProjectDetailsPane } from './ProjectDetailsPane';
import {
  DeleteProjectDialog,
  ExportProgressOverlay,
  RenameProjectDialog,
} from './ProjectDashboardDialogs';
import { useProjectsDashboard } from './useProjectsDashboard';

/** Options a parent may pass when it owns the Clear Library dialog. */
export interface OpenClearLibraryOptions {
  /** Initial clearing mode. */
  mode?: ClearLibraryMode;
  /** Initial project selection. */
  projectIds?: number[];
  /** Initial page selection. */
  jobIds?: number[];
}

/** Props for the unified library dashboard. */
export interface ProjectsDashboardProps {
  /** Opens a project in the Studio editor. */
  onOpenProject: (projectId: number) => void;
  /** Opens the add-pages-from-library dialog. */
  onOpenAddFromLibrary: (projectId: number) => void;
  /** Opens a translated page in the Canvas editor. */
  onOpenPage?: (jobId: number) => void;
  /** Delegates Clear Library to the parent when provided. */
  onOpenClearLibrary?: (opts?: OpenClearLibraryOptions) => void;
  /** Forces a library reload when the parent changes it. */
  refreshKey?: number;
  /** Project open in the editor, warned about before clearing. */
  activeProjectId?: number | null;
  /** Page open in the editor, warned about before clearing. */
  activeJobId?: number | null;
  /** Notifies the parent after a library mutation. */
  onLibraryMutated?: (result?: ClearLibraryResult) => void;
  onBackToEditor?: () => void;
}

/**
 * Renders the unified library dashboard with projects, translated pages,
 * filtering, inspectors, and destructive maintenance.
 *
 * @param props - Parent navigation, refresh, and mutation callbacks.
 * @returns Full-screen library dashboard.
 */
export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = (props) => {
  const {
    projects,
    jobs,
    selectedProject,
    selectedJob,
    selectedSummary,
    selectedProjectId,
    selectedJobId,
    selectedProjectIds,
    selectedJobIds,
    activeTab,
    datePreset,
    customDate,
    sortOrder,
    layoutMode,
    localRefreshKey,
    clearRequest,
    isClearLibraryOpen,
    renameTarget,
    renameValue,
    deleteTarget,
    isExporting,
    exportProgressText,
    setActiveTab,
    setDatePreset,
    setCustomDate,
    setSortOrder,
    setLayoutMode,
    setSelectedProjectId,
    setSelectedJobId,
    setRenameTarget,
    setRenameValue,
    setDeleteTarget,
    setIsClearLibraryOpen,
    toggleProjectSelection,
    toggleJobSelection,
    clearSelection,
    handleCreateProject,
    handleStartRename,
    handleConfirmRename,
    handleConfirmDelete,
    handleOpenClearLibrary,
    handleCleared,
    handleDeletePage,
    handleAssignPageToProject,
    handleBatchExport,
  } = useProjectsDashboard(props);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090a0f] text-slate-100 flex">
      <LibrarySidebar
        totalProjects={projects.length}
        totalImages={jobs.length}
        selectedProject={selectedProject}
        refreshKey={(props.refreshKey ?? 0) + localRefreshKey}
        selectedSummary={selectedSummary}
        onOpenClearLibrary={() => handleOpenClearLibrary()}
        onOpenSelected={() => {
          if (selectedProjectId !== null) props.onOpenProject(selectedProjectId);
          else if (selectedJobId !== null) props.onOpenPage?.(selectedJobId);
        }}
        onExportSelected={() => void handleBatchExport('images')}
        onRenameSelected={() => selectedProjectId !== null && handleStartRename(selectedProjectId)}
        onDeleteSelected={() => {
          const project = projects.find((entry) => entry.id === selectedProjectId);
          if (project) setDeleteTarget(project);
        }}
        onCreateNewProject={() => void handleCreateProject()}
        onBackToEditor={props.onBackToEditor}
      />

      <ProjectsGrid
        projects={projects}
        jobs={jobs}
        selectedProjectId={selectedProjectId}
        selectedJobId={selectedJobId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        customDate={customDate}
        onCustomDateChange={setCustomDate}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        selectedProjectIds={selectedProjectIds}
        selectedJobIds={selectedJobIds}
        onToggleSelectProject={toggleProjectSelection}
        onToggleSelectJob={toggleJobSelection}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          setSelectedJobId(null);
        }}
        onOpenProject={props.onOpenProject}
        onSelectJob={(jobId) => {
          setSelectedJobId(jobId);
          setSelectedProjectId(null);
        }}
        onOpenPage={(jobId) => {
          if (props.onOpenPage) props.onOpenPage(jobId);
          else {
            setSelectedJobId(jobId);
            setSelectedProjectId(null);
          }
        }}
        onDeletePage={(jobId) => void handleDeletePage(jobId)}
        onClearSelected={clearSelection}
        onRenameProject={handleStartRename}
        onDeleteProject={(projectId) => {
          const project = projects.find((entry) => entry.id === projectId);
          if (project) setDeleteTarget(project);
        }}
        onExportProject={(projectId) => {
          setSelectedProjectId(projectId);
          void handleBatchExport('images', projectId);
        }}
        onCreateProject={() => void handleCreateProject()}
      />

      <ProjectDetailsPane
        project={selectedProject}
        selectedJob={selectedJob}
        projects={projects}
        onOpenPage={props.onOpenPage}
        onDeletePage={(jobId) => void handleDeletePage(jobId)}
        onAssignPageToProject={(jobId, projectId) => void handleAssignPageToProject(jobId, projectId)}
        onOpenStudio={() => selectedProjectId !== null && props.onOpenProject(selectedProjectId)}
        onAddFromLibrary={() => selectedProjectId !== null && props.onOpenAddFromLibrary(selectedProjectId)}
        onBatchExport={(format) => void handleBatchExport(format)}
      />

      {!props.onOpenClearLibrary && (
        <ClearLibraryModal
          isOpen={isClearLibraryOpen}
          onClose={() => setIsClearLibraryOpen(false)}
          projects={projects}
          jobs={jobs}
          activeProjectId={props.activeProjectId ?? selectedProjectId}
          activeJobId={props.activeJobId ?? selectedJobId}
          initialMode={clearRequest.mode}
          initialSelectedProjectIds={clearRequest.projectIds}
          initialSelectedJobIds={clearRequest.jobIds}
          onCleared={handleCleared}
        />
      )}

      {renameTarget && (
        <RenameProjectDialog
          project={renameTarget}
          value={renameValue}
          onChange={setRenameValue}
          onCancel={() => setRenameTarget(null)}
          onConfirm={(event) => void handleConfirmRename(event)}
        />
      )}

      {deleteTarget && (
        <DeleteProjectDialog
          project={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={(cascade) => void handleConfirmDelete(cascade)}
        />
      )}

      {isExporting && <ExportProgressOverlay message={exportProgressText} />}
    </div>
  );
};
