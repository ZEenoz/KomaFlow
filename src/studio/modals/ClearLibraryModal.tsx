import React from 'react';
import { Trash2, X } from 'lucide-react';
import type { ProjectFolder, TranslationJob } from '../../db';
import {
  type ClearLibraryMode,
  type ClearLibraryResult,
} from '../state/projectStore';
import { ClearLibraryControls } from './ClearLibraryControls';
import { ClearLibraryCustomView } from './ClearLibraryCustomView';
import { ClearLibraryFooter } from './ClearLibraryFooter';
import { ClearLibraryWarnings } from './ClearLibraryWarnings';
import { useClearLibraryState } from './useClearLibraryState';

/** Props for the destructive library-maintenance dialog. */
export interface ClearLibraryModalProps {
  /** Whether the dialog is rendered. */
  isOpen: boolean;
  /** Closes the dialog without deleting anything. */
  onClose: () => void;
  /** All known project folders. */
  projects: ProjectFolder[];
  /** All known translation jobs. */
  jobs: TranslationJob[];
  /** Project currently open in the editor, warned about before deletion. */
  activeProjectId?: number | null;
  /** Page currently open in the editor, warned about before deletion. */
  activeJobId?: number | null;
  /** Initial mode; defaults to clearing everything. */
  initialMode?: ClearLibraryMode;
  /** Initial project selection for custom mode. */
  initialSelectedProjectIds?: number[];
  /** Initial page selection for custom mode. */
  initialSelectedJobIds?: number[];
  /** Receives the deletion report before the dialog closes. */
  onCleared: (result: ClearLibraryResult) => void | Promise<void>;
}

/**
 * Renders the Clear Library confirmation dialog with scope, cascade, and
 * custom record selection controls.
 *
 * @param props - Open state, library records, initial selection, and callbacks.
 * @returns Destructive library modal, or null while closed.
 */
export const ClearLibraryModal: React.FC<ClearLibraryModalProps> = (props) => {
  const {
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
  } = useClearLibraryState(props);

  if (!props.isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clear Library"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none"
    >
      <div className="w-full max-w-3xl max-h-[88vh] rounded-2xl bg-[#12141c] border border-[#262a3b] shadow-2xl flex flex-col overflow-hidden">
        <div className="h-14 px-5 border-b border-[#262a3b] bg-[#141724] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-slate-100">Clear Library</h3>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1c1f2e] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <ClearLibraryControls
            mode={mode}
            scope={scope}
            cascadeProjects={cascadeProjects}
            onModeChange={setMode}
            onScopeChange={setScope}
            onCascadeChange={setCascadeProjects}
          />

          {mode === 'custom' && (
            <ClearLibraryCustomView
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              projects={visibleProjects}
              jobs={visibleJobs}
              projectsById={projectsById}
              pageCountByProjectId={pageCountByProjectId}
              projectBytesById={breakdown?.projectBytesById ?? {}}
              jobBytesById={breakdown?.jobBytesById ?? {}}
              selectedProjectIds={selectedProjectIds}
              selectedJobIds={selectedJobIds}
              onToggleProject={toggleProject}
              onToggleJob={toggleJob}
            />
          )}

          <ClearLibraryWarnings
            mode={mode}
            activeProjectTargeted={activeProjectTargeted}
            activeJobTargeted={activeJobTargeted}
            errorMessage={errorMessage}
          />
        </div>

        <ClearLibraryFooter
          summary={summary}
          isLoading={isLoadingBreakdown}
          hasTargets={hasTargets}
          isSubmitting={isSubmitting}
          mode={mode}
          onCancel={props.onClose}
          onConfirm={() => void handleConfirm()}
        />
      </div>
    </div>
  );
};
