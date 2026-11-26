import React from 'react';
import { FolderPlus, Plus } from 'lucide-react';

/** Props for the library's empty or no-results state. */
export interface LibraryEmptyStateProps {
  /** Whether any projects or pages exist outside the current filters. */
  hasLibrary: boolean;
  /** Creates a new project from the true-empty state. */
  onCreateProject: () => void;
}

/**
 * Renders the true-empty or filtered-empty library message.
 *
 * @param props - Whether the library itself is empty and the create callback.
 * @returns Empty-state content.
 */
export const LibraryEmptyState: React.FC<LibraryEmptyStateProps> = ({
  hasLibrary,
  onCreateProject,
}) => (
  <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8">
    <div className="w-16 h-16 rounded-3xl bg-[#12141c] border border-[#262a3b] flex items-center justify-center text-slate-600 mb-4 shadow-inner">
      <FolderPlus className="w-8 h-8 text-[#60c1e5]/60" />
    </div>
    <h3 className="text-base font-semibold text-slate-200">
      {hasLibrary ? 'No library items match these filters' : 'No manga projects found'}
    </h3>
    <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
      {hasLibrary
        ? 'Change the tab, search query, or date window to see more of your library.'
        : 'Create your first project or bundle translated pages together.'}
    </p>
    {!hasLibrary && (
      <button
        type="button"
        onClick={onCreateProject}
        className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#005a9c] hover:bg-[#1b365d] text-white text-xs font-semibold shadow-md shadow-[rgba(0,90,156,0.25)] transition cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>Create Project</span>
      </button>
    )}
  </div>
);
