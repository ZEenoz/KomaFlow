import { useEffect, useMemo, useState } from 'react';
import {
  clearLibrary,
  getLibraryStorageBreakdown,
  type ClearLibraryMode,
  type ClearLibraryOptions,
  type ClearLibraryScope,
  type LibraryStorageBreakdown,
} from '../state/projectStore';
import { getJobDisplayName } from '../state/historyFilter';
import type { ClearLibraryModalProps } from './ClearLibraryModal';
import { resolveClearTargets, summarizeClearTargets } from './clearLibrarySelection';

/**
 * Owns Clear Library dialog state: storage breakdown, scope, selection,
 * summary, active-target warnings, and the confirm request.
 *
 * @param props - Open state, records, initial selection, and callbacks.
 * @returns State values and handlers consumed by the dialog view.
 */
export function useClearLibraryState({
  isOpen,
  onClose,
  projects,
  jobs,
  activeProjectId,
  activeJobId,
  initialMode = 'all',
  initialSelectedProjectIds,
  initialSelectedJobIds,
  onCleared,
}: ClearLibraryModalProps) {
  const [mode, setMode] = useState<ClearLibraryMode>(initialMode);
  const [scope, setScope] = useState<ClearLibraryScope>('all');
  const [cascadeProjects, setCascadeProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set());
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [breakdown, setBreakdown] = useState<LibraryStorageBreakdown | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    setMode(initialMode);
    setScope('all');
    setCascadeProjects(false);
    setSearchQuery('');
    setSelectedProjectIds(new Set(initialSelectedProjectIds ?? []));
    setSelectedJobIds(new Set(initialSelectedJobIds ?? []));
    setBreakdown(null);
    setErrorMessage(null);
    setIsSubmitting(false);
    setIsLoadingBreakdown(true);

    void getLibraryStorageBreakdown()
      .then((loaded) => {
        if (!isCancelled) setBreakdown(loaded);
      })
      .catch((err) => {
        console.warn('[ClearLibraryModal] Failed loading storage breakdown:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingBreakdown(false);
      });

    return () => {
      isCancelled = true;
    };
    // Initial selection intentionally applies once per open, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const projectsById = useMemo(
    () => new Map(projects.flatMap((project) => (project.id === undefined ? [] : [[project.id, project] as const]))),
    [projects]
  );
  const pageCountByProjectId = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const job of jobs) {
      if (job.folderId !== undefined) counts[job.folderId] = (counts[job.folderId] ?? 0) + 1;
    }
    return counts;
  }, [jobs]);

  const query = searchQuery.toLowerCase().trim();
  const visibleProjects = scope === 'pages' ? [] : projects.filter((project) => (
    !query || project.title.toLowerCase().includes(query)
  ));
  const visibleJobs = scope === 'projects' ? [] : jobs.filter((job) => {
    if (!query) return true;
    const projectTitle = job.folderId !== undefined ? projectsById.get(job.folderId)?.title ?? '' : '';
    return [getJobDisplayName(job), job.srcUrl ?? '', job.pageName ?? '', projectTitle]
      .some((value) => value.toLowerCase().includes(query));
  });

  const targets = useMemo(
    () => resolveClearTargets(
      projects,
      jobs,
      scope,
      mode,
      selectedProjectIds,
      selectedJobIds,
      cascadeProjects
    ),
    [projects, jobs, scope, mode, selectedProjectIds, selectedJobIds, cascadeProjects]
  );
  const summary = useMemo(
    () => summarizeClearTargets(projects, jobs, targets, breakdown),
    [projects, jobs, targets, breakdown]
  );

  const activeProjectTargeted = activeProjectId !== undefined
    && activeProjectId !== null
    && targets.projectIds.has(activeProjectId);
  const activeJobTargeted = activeJobId !== undefined
    && activeJobId !== null
    && targets.jobIds.has(activeJobId);
  const hasTargets = targets.projectIds.size > 0 || targets.jobIds.size > 0;

  const toggleProject = (projectId: number) => {
    setSelectedProjectIds((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const toggleJob = (jobId: number) => {
    setSelectedJobIds((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const nextProjects = new Set(selectedProjectIds);
    const nextJobs = new Set(selectedJobIds);
    for (const project of visibleProjects) if (project.id !== undefined) nextProjects.add(project.id);
    for (const job of visibleJobs) if (job.id !== undefined) nextJobs.add(job.id);
    setSelectedProjectIds(nextProjects);
    setSelectedJobIds(nextJobs);
  };

  const handleClearSelection = () => {
    if (scope === 'pages') {
      setSelectedJobIds(new Set());
    } else if (scope === 'projects') {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set());
      setSelectedJobIds(new Set());
    }
  };

  const handleConfirm = async () => {
    if (!hasTargets || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const options: ClearLibraryOptions = { mode, scope, cascadeProjects };
    if (mode === 'custom') {
      options.projectIds = Array.from(selectedProjectIds);
      options.jobIds = Array.from(selectedJobIds);
    }

    try {
      const result = await clearLibrary(options);
      await onCleared(result);
      onClose();
    } catch (err) {
      console.error('[ClearLibraryModal] Clear failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Could not clear the library.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    mode,
    scope,
    cascadeProjects,
    searchQuery,
    selectedProjectIds,
    selectedJobIds,
    breakdown,
    isLoadingBreakdown,
    isSubmitting,
    errorMessage,
    projectsById,
    pageCountByProjectId,
    visibleProjects,
    visibleJobs,
    summary,
    activeProjectTargeted,
    activeJobTargeted,
    hasTargets,
    setMode,
    setScope,
    setCascadeProjects,
    setSearchQuery,
    toggleProject,
    toggleJob,
    handleSelectAll,
    handleClearSelection,
    handleConfirm,
  };
}
