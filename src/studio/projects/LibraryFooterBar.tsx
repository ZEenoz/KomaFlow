import React from 'react';
import { Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { MAX_TILE_SIZE_REM, MIN_TILE_SIZE_REM } from './libraryViewConstants';

/** Props for the library footer's thumbnail-size and create controls. */
export interface LibraryFooterBarProps {
  /** Current thumbnail size in rem units. */
  tileSizeRem: number;
  /** Updates the thumbnail size. */
  onTileSizeChange: (sizeRem: number) => void;
  /** Active grid or list presentation. */
  layoutMode: 'grid' | 'list';
  /** Creates a new project. */
  onCreateProject: () => void;
}

/**
 * Renders the thumbnail-size slider and new-project action.
 *
 * @param props - Slider value, layout, and callbacks.
 * @returns Library footer bar.
 */
export const LibraryFooterBar: React.FC<LibraryFooterBarProps> = ({
  tileSizeRem,
  onTileSizeChange,
  layoutMode,
  onCreateProject,
}) => (
  <div className="h-14 px-6 border-t border-[#262a3b] bg-[#12141c]/70 flex items-center justify-between shrink-0">
    <div className="flex items-center gap-2">
      <ZoomOut className="w-3.5 h-3.5 text-slate-500" />
      <input
        type="range"
        min={MIN_TILE_SIZE_REM}
        max={MAX_TILE_SIZE_REM}
        step={0.5}
        value={tileSizeRem}
        onChange={(event) => onTileSizeChange(parseFloat(event.target.value))}
        title="Thumbnail size"
        aria-label="Thumbnail size"
        disabled={layoutMode === 'list'}
        className="w-28 sm:w-44 h-1.5 bg-[#262a3b] rounded-lg appearance-none cursor-pointer accent-[#60c1e5] disabled:opacity-30"
      />
      <ZoomIn className="w-3.5 h-3.5 text-slate-500" />
    </div>

    <button
      type="button"
      onClick={onCreateProject}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#005a9c] hover:bg-[#1b365d] text-white text-xs font-semibold shadow-md shadow-[rgba(0,90,156,0.25)] transition cursor-pointer"
    >
      <Plus className="w-4 h-4" />
      <span>New project</span>
    </button>
  </div>
);
