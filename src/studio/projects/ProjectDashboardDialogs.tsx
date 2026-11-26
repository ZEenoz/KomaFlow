import React from 'react';
import type { ProjectFolder } from '../../db';

/** Props for the rename-project dialog. */
export interface RenameProjectDialogProps {
  /** Project being renamed. */
  project: ProjectFolder;
  /** Controlled title value. */
  value: string;
  /** Updates the title value. */
  onChange: (value: string) => void;
  /** Cancels without saving. */
  onCancel: () => void;
  /** Submits the new title. */
  onConfirm: (event: React.FormEvent) => void;
}

/**
 * Renders the project rename form overlay.
 *
 * @param props - Target project, controlled value, and callbacks.
 * @returns Rename modal.
 */
export const RenameProjectDialog: React.FC<RenameProjectDialogProps> = ({
  project,
  value,
  onChange,
  onCancel,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
    <form
      onSubmit={onConfirm}
      className="w-full max-w-sm rounded-xl bg-[#161924] border border-[#262a3b] p-5 shadow-2xl flex flex-col gap-4"
    >
      <h3 className="text-sm font-semibold text-slate-100">Rename Project</h3>
      <p className="text-xs text-slate-500 truncate" title={project.title}>{project.title}</p>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Project title"
        className="w-full h-9 px-3 rounded-lg bg-[#090a0f] border border-[#262a3b] text-xs text-slate-100 focus:outline-none focus:border-[#60c1e5]"
      />
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 text-xs font-semibold bg-[#005a9c] hover:bg-[#1b365d] text-white rounded-lg shadow-md shadow-[rgba(0,90,156,0.25)] transition cursor-pointer"
        >
          Save
        </button>
      </div>
    </form>
  </div>
);

/** Props for the delete-project confirmation dialog. */
export interface DeleteProjectDialogProps {
  /** Project being deleted. */
  project: ProjectFolder;
  /** Cancels the deletion. */
  onCancel: () => void;
  /** Confirms deletion, cascading member pages when requested. */
  onConfirm: (cascade: boolean) => void;
}

/**
 * Renders the unlink-versus-cascade delete confirmation overlay.
 *
 * @param props - Target project and confirmation callbacks.
 * @returns Project delete modal.
 */
export const DeleteProjectDialog: React.FC<DeleteProjectDialogProps> = ({
  project,
  onCancel,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
    <div className="w-full max-w-sm rounded-xl bg-[#161924] border border-[#262a3b] p-5 shadow-2xl flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-red-400">Delete Project</h3>
      <p className="text-xs text-slate-400 leading-relaxed">
        Are you sure you want to delete <strong className="text-slate-200">“{project.title}”</strong>?
      </p>
      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => onConfirm(false)}
          className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-[#262a3b] hover:bg-[#343b52] text-slate-200 transition cursor-pointer"
        >
          Unlink Pages (Keep in Library)
        </button>
        <button
          type="button"
          onClick={() => onConfirm(true)}
          className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition cursor-pointer"
        >
          Delete Project and All Its Images
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-1.5 px-3 text-xs text-slate-400 hover:text-white transition cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

/**
 * Renders the blocking batch-export progress overlay.
 *
 * @param props - Current progress message.
 * @returns Export overlay.
 */
export const ExportProgressOverlay: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
    <div className="w-full max-w-xs rounded-xl bg-[#161924] border border-[#262a3b] p-6 shadow-2xl flex flex-col items-center gap-3 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#60c1e5] border-t-transparent animate-spin" />
      <h4 className="text-sm font-semibold text-slate-100">Exporting Manga Archive</h4>
      <p className="text-xs text-slate-400">{message || 'Packaging files...'}</p>
    </div>
  </div>
);
