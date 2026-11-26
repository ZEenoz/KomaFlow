import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { db, type ProjectFolder, type TranslationJob } from '../../db';
import {
  addJobsToProject,
  clearLibrary,
  createProject,
  type ClearLibraryResult,
} from '../state/projectStore';
import {
  getJobDisplayName,
  type HistoryDatePreset,
  type HistorySortOrder,
  type LibraryViewTab,
} from '../state/historyFilter';
import type { BatchExportFormat } from '../export/batchExport';
import type { OpenClearLibraryOptions, ProjectsDashboardProps } from './ProjectsDashboard';
import { useProjectDialogs } from './useProjectDialogs';

/** State and actions consumed by the library dashboard view. */
export interface ProjectsDashboardState {
  projects: ProjectFolder[];
  jobs: TranslationJob[];
  selectedProject: ProjectFolder | null;
  selectedJob: TranslationJob | null;
  selectedSummary?: string;
  selectedProjectId: number | null;
  selectedJobId: number | null;
  selectedProjectIds: Set<number>;
  selectedJobIds: Set<number>;
  activeTab: LibraryViewTab;
  datePreset: HistoryDatePreset;
  customDate: string;
  sortOrder: HistorySortOrder;
  layoutMode: 'grid' | 'list';
  localRefreshKey: number;
  clearRequest: OpenClearLibraryOptions;
  isClearLibraryOpen: boolean;
  renameTarget: ProjectFolder | null;
  renameValue: string;
  deleteTarget: ProjectFolder | null;
  isExporting: boolean;
  exportProgressText: string;
  setActiveTab: (tab: LibraryViewTab) => void;
  setDatePreset: (preset: HistoryDatePreset) => void;
  setCustomDate: (date: string) => void;
  setSortOrder: (order: HistorySortOrder) => void;
  setLayoutMode: (mode: 'grid' | 'list') => void;
  setSelectedProjectId: (projectId: number | null) => void;
  setSelectedJobId: (jobId: number | null) => void;
  setRenameTarget: (project: ProjectFolder | null) => void;
  setRenameValue: (value: string) => void;
  setDeleteTarget: (project: ProjectFolder | null) => void;
  setIsClearLibraryOpen: (open: boolean) => void;
  toggleProjectSelection: (projectId: number) => void;
  toggleJobSelection: (jobId: number) => void;
  clearSelection: () => void;
  handleCreateProject: () => Promise<void>;
  handleStartRename: (projectId: number) => void;
  handleConfirmRename: (event: FormEvent) => Promise<void>;
  handleConfirmDelete: (cascade: boolean) => Promise<void>;
  handleOpenClearLibrary: (opts?: OpenClearLibraryOptions) => void;
  handleCleared: (result: ClearLibraryResult) => Promise<void>;
  handleDeletePage: (jobId: number) => Promise<void>;
  handleAssignPageToProject: (jobId: number, projectId: number) => Promise<void>;
  handleBatchExport: (format: BatchExportFormat, projectId?: number) => Promise<void>;
}

/**
 * Loads library records and owns dashboard filters, inspectors, selections,
 * and record mutations.
 *
 * @param props - Parent refresh, navigation, and mutation callbacks.
 * @returns Dashboard state and action handlers.
 */
export function useProjectsDashboard(props: ProjectsDashboardProps): ProjectsDashboardState {
  const { onOpenClearLibrary, refreshKey, activeProjectId, activeJobId, onLibraryMutated } = props;
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [activeTab, setActiveTab] = useState<LibraryViewTab>('all');
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('all');
  const [customDate, setCustomDate] = useState('');
  const [sortOrder, setSortOrder] = useState<HistorySortOrder>('newest');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set());
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(activeProjectId ?? null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(activeJobId ?? null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const refreshLibrary = useCallback(async () => {
    try {
      const [allProjects, allJobs] = await Promise.all([
        db.projectFolders.toArray(),
        db.translationJobs.orderBy('timestamp').reverse().toArray(),
      ]);
      setProjects(allProjects);
      setJobs(allJobs);
    } catch (err) {
      console.warn('[ProjectsDashboard] Failed loading library:', err);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary, refreshKey]);

  useEffect(() => {
    if (selectedJobId !== null && jobs.length > 0 && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(null);
    }
  }, [jobs, selectedJobId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  const selectedSummary = useMemo(() => {
    const selectedCount = selectedProjectIds.size + selectedJobIds.size;
    if (selectedCount > 1) return `${selectedCount} selected`;
    if (selectedProject) return selectedProject.title;
    if (selectedJob) return getJobDisplayName(selectedJob);
    if (selectedProjectIds.size === 1) {
      const projectId = Array.from(selectedProjectIds)[0];
      return projects.find((project) => project.id === projectId)?.title;
    }
    if (selectedJobIds.size === 1) {
      const jobId = Array.from(selectedJobIds)[0];
      const job = jobs.find((entry) => entry.id === jobId);
      return job ? getJobDisplayName(job) : undefined;
    }
    return undefined;
  }, [selectedProjectIds, selectedJobIds, selectedProject, selectedJob, projects, jobs]);

  const markLibraryMutated = useCallback((result?: ClearLibraryResult) => {
    setLocalRefreshKey((key) => key + 1);
    onLibraryMutated?.(result);
  }, [onLibraryMutated]);

  const clearSelection = () => {
    setSelectedProjectIds(new Set());
    setSelectedJobIds(new Set());
  };

  const toggleProjectSelection = (projectId: number) => {
    setSelectedProjectIds((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const toggleJobSelection = (jobId: number) => {
    setSelectedJobIds((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const dialogs = useProjectDialogs({
    projects,
    refreshLibrary,
    selectedProjectId,
    setSelectedProjectId,
    markLibraryMutated,
    clearSelections: () => {
      clearSelection();
      setSelectedJobId(null);
    },
    onOpenClearLibrary,
  });

  const handleCreateProject = async () => {
    const newId = await createProject();
    await refreshLibrary();
    setSelectedProjectId(newId);
    setSelectedJobId(null);
    markLibraryMutated();
  };

  const handleDeletePage = async (jobId: number) => {
    try {
      const result = await clearLibrary({ mode: 'custom', scope: 'pages', jobIds: [jobId] });
      await refreshLibrary();
      setSelectedJobIds((previous) => {
        const next = new Set(previous);
        next.delete(jobId);
        return next;
      });
      markLibraryMutated(result);
    } catch (err) {
      console.error('[ProjectsDashboard] Failed deleting page:', err);
    }
  };

  const handleAssignPageToProject = async (jobId: number, projectId: number) => {
    try {
      await addJobsToProject(projectId, [jobId]);
      await refreshLibrary();
      markLibraryMutated();
    } catch (err) {
      console.error('[ProjectsDashboard] Failed assigning page:', err);
    }
  };

  return {
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
    ...dialogs,
    setActiveTab,
    setDatePreset,
    setCustomDate,
    setSortOrder,
    setLayoutMode,
    setSelectedProjectId,
    setSelectedJobId,
    toggleProjectSelection,
    toggleJobSelection,
    clearSelection,
    handleCreateProject,
    handleDeletePage,
    handleAssignPageToProject,
  };
}
