import { useState, type FormEvent } from 'react';
import type { ProjectFolder } from '../../db';
import {
  deleteProject,
  renameProject,
  type ClearLibraryResult,
} from '../state/projectStore';
import type { BatchExportFormat } from '../export/batchExport';
import type { OpenClearLibraryOptions } from './ProjectsDashboard';

/** Inputs shared with the dashboard's dialog/action hook. */
export interface UseProjectDialogsOptions {
  /** Current library projects. */
  projects: ProjectFolder[];
  /** Reloads projects and pages after a mutation. */
  refreshLibrary: () => Promise<void>;
  /** Project currently inspected. */
  selectedProjectId: number | null;
  /** Clears the inspected project. */
  setSelectedProjectId: (projectId: number | null) => void;
  /** Bumps refresh state and notifies the parent. */
  markLibraryMutated: (result?: ClearLibraryResult) => void;
  /** Clears multi-selection after a destructive operation. */
  clearSelections: () => void;
  /** Parent-owned Clear Library handler, when supplied. */
  onOpenClearLibrary?: (opts?: OpenClearLibraryOptions) => void;
}

/**
 * Owns rename, delete, export, and Clear Library dialog state and actions.
 *
 * @param options - Library records, refresh, selection, and parent callbacks.
 * @returns Dialog state and action handlers.
 */
export function useProjectDialogs({
  projects,
  refreshLibrary,
  selectedProjectId,
  setSelectedProjectId,
  markLibraryMutated,
  clearSelections,
  onOpenClearLibrary,
}: UseProjectDialogsOptions) {
  const [clearRequest, setClearRequest] = useState<OpenClearLibraryOptions>({});
  const [isClearLibraryOpen, setIsClearLibraryOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectFolder | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');

  const handleStartRename = (projectId: number) => {
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) return;
    setRenameTarget(project);
    setRenameValue(project.title);
  };

  const handleConfirmRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renameTarget?.id || !renameValue.trim()) return;
    await renameProject(renameTarget.id, renameValue);
    await refreshLibrary();
    setRenameTarget(null);
    markLibraryMutated();
  };

  const handleConfirmDelete = async (cascade: boolean) => {
    if (!deleteTarget?.id) return;
    await deleteProject(deleteTarget.id, cascade);
    await refreshLibrary();
    if (selectedProjectId === deleteTarget.id) setSelectedProjectId(null);
    setDeleteTarget(null);
    markLibraryMutated();
  };

  const handleOpenClearLibrary = (opts?: OpenClearLibraryOptions) => {
    if (onOpenClearLibrary) {
      onOpenClearLibrary(opts);
      return;
    }
    setClearRequest(opts ?? {});
    setIsClearLibraryOpen(true);
  };

  const handleCleared = async (result: ClearLibraryResult) => {
    await refreshLibrary();
    clearSelections();
    setSelectedProjectId(null);
    markLibraryMutated(result);
  };

  const handleBatchExport = async (format: BatchExportFormat, projectId?: number) => {
    const targetProjectId = projectId ?? selectedProjectId;
    if (!targetProjectId) return;
    setIsExporting(true);
    setExportProgressText('Preparing export bundle...');
    try {
      const { exportProjectBundle } = await import('../export/batchExport');
      await exportProjectBundle(targetProjectId, format, (_current, _total, status) => {
        setExportProgressText(status);
      });
    } catch (err) {
      console.error('[Dashboard] Export failed:', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
      setExportProgressText('');
    }
  };

  return {
    clearRequest,
    isClearLibraryOpen,
    setIsClearLibraryOpen,
    renameTarget,
    renameValue,
    setRenameTarget,
    setRenameValue,
    deleteTarget,
    setDeleteTarget,
    isExporting,
    exportProgressText,
    handleStartRename,
    handleConfirmRename,
    handleConfirmDelete,
    handleOpenClearLibrary,
    handleCleared,
    handleBatchExport,
  };
}
