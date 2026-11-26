import React, { useEffect, useState } from 'react';
import {
  Layers,
  FolderOpen,
  PlusCircle,
  Download,
  Calendar,
  Clock,
  Sparkles,
  FileCode,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { db, type ProjectFolder } from '../../db';
import { getProjectStats, type ProjectStats } from '../state/projectStore';
import { getTranslatedPageThumbnailUrl } from '../canvas/thumbnailRenderer';
import type { BatchExportFormat } from '../export/batchExport';

/** Props for the selected-project inspector. */
export interface ProjectInspectorProps {
  /** Project whose cover, statistics, and exports are shown. */
  project: ProjectFolder;
  /** Opens the project in the Studio canvas editor. */
  onOpenStudio: () => void;
  /** Opens the add-pages-from-library dialog. */
  onAddFromLibrary: () => void;
  /** Starts a batch export in the requested format. */
  onBatchExport: (format: BatchExportFormat) => void;
}

/**
 * Renders project cover, progress, language, and export actions.
 *
 * @param props - Selected project and action callbacks.
 * @returns Project detail sidebar.
 */
export const ProjectInspector: React.FC<ProjectInspectorProps> = ({
  project,
  onOpenStudio,
  onAddFromLibrary,
  onBatchExport,
}) => {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadDetails = async () => {
      if (!project.id) {
        setStats(null);
        setCoverUrl(null);
        return;
      }

      const pStats = await getProjectStats(project.id);
      if (isCancelled) return;
      setStats(pStats);

      const coverTargetId = project.coverJobId;
      let targetJob = coverTargetId ? await db.translationJobs.get(coverTargetId) : null;
      if (!targetJob) {
        targetJob = await db.translationJobs.where('folderId').equals(project.id).first();
      }

      if (targetJob?.id) {
        const thumbUrl = await getTranslatedPageThumbnailUrl(targetJob.id, 600);
        if (!isCancelled) setCoverUrl(thumbUrl);
      }
    };

    void loadDetails();

    return () => {
      isCancelled = true;
    };
  }, [project]);

  const createdDate = new Date(project.timestamp).toLocaleDateString(undefined, { dateStyle: 'medium' });
  const updatedDate = new Date(project.updatedAt || project.timestamp).toLocaleDateString(undefined, { dateStyle: 'medium' });
  const totalPages = stats?.pageCount || 0;
  const translated = stats?.translatedCount || 0;
  const progressPercent = totalPages > 0 ? Math.round((translated / totalPages) * 100) : 0;
  const sizeMB = stats ? (stats.totalBytes / (1024 * 1024)).toFixed(1) : '0';

  return (
    <aside className="w-80 bg-[#12141c] border-l border-[#262a3b] flex flex-col justify-between p-4 overflow-y-auto select-none shrink-0">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] uppercase font-bold tracking-wider text-slate-400">Details</span>
        </div>

        <div className="relative w-full h-44 rounded-xl overflow-hidden bg-[#161924] border border-[#262a3b] flex items-center justify-center shadow-inner">
          {coverUrl ? (
            <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center text-slate-500 text-xs gap-1">
              <Layers className="w-8 h-8 opacity-40 text-slate-600" />
              <span>No cover page</span>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-100 truncate" title={project.title}>{project.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span>{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
            <span>•</span>
            <span>{sizeMB} MB</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#161924] border border-[#262a3b]">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>Progress</span>
            <span className="text-[#60c1e5] tabular-nums font-bold">{progressPercent}%</span>
          </div>

          <div className="w-full h-2 bg-[#262a3b] rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPercent}%` }} />
            {stats && stats.errorCount > 0 && (
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${Math.round((stats.errorCount / totalPages) * 100)}%` }}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[0.7rem] text-slate-400 pt-1">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {translated} Translated
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              {stats?.pendingCount || 0} Pending
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#60c1e5]" />
              <span>Dialogue Bubbles</span>
            </span>
            <span className="font-semibold text-slate-200 tabular-nums">{stats?.totalTextBlocks || 0}</span>
          </div>

          {stats && stats.languages.length > 0 && (
            <div className="flex items-center justify-between">
              <span>Target Languages</span>
              <div className="flex gap-1">
                {stats.languages.map((lang) => (
                  <span
                    key={lang}
                    className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase bg-[#005a9c]/15 text-[#60c1e5] border border-[#60c1e5]/30"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-[#262a3b]/60 text-[0.7rem]">
            <span className="flex items-center gap-1 text-slate-500">
              <Calendar className="w-3 h-3" /> Created
            </span>
            <span className="text-slate-400">{createdDate}</span>
          </div>

          <div className="flex items-center justify-between text-[0.7rem]">
            <span className="flex items-center gap-1 text-slate-500">
              <Clock className="w-3 h-3" /> Modified
            </span>
            <span className="text-slate-400">{updatedDate}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-4 border-t border-[#262a3b]">
        <button
          type="button"
          onClick={onOpenStudio}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#005a9c] hover:bg-[#1b365d] text-white text-xs font-semibold shadow-md shadow-[rgba(0,90,156,0.25)] transition cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" />
          <span>Open in Studio</span>
        </button>

        <button
          type="button"
          onClick={onAddFromLibrary}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#161924] hover:bg-[#202436] border border-[#262a3b] text-slate-200 text-xs font-semibold transition cursor-pointer"
        >
          <PlusCircle className="w-3.5 h-3.5 text-[#60c1e5]" />
          <span>Add Pages from Library</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsExportMenuOpen((value) => !value)}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-[#161924] hover:bg-[#202436] border border-[#262a3b] text-slate-300 text-xs font-medium transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export Package</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isExportMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#161924] border border-[#262a3b] rounded-lg shadow-xl z-50 py-1 text-xs text-slate-200">
              {([
                { format: 'images' as const, label: 'Standard ZIP', detail: 'Numbered image scans', icon: Download },
                { format: 'cbz' as const, label: 'Comic Book CBZ', detail: 'For comic reader apps', icon: FileText },
                { format: 'psd' as const, label: 'Layered Photoshop PSD', detail: 'Clean art + editable text', icon: FileCode },
              ]).map((entry) => (
                <button
                  key={entry.format}
                  type="button"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    onBatchExport(entry.format);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#262a3b] transition text-left cursor-pointer"
                >
                  <entry.icon className="w-3.5 h-3.5 text-[#60c1e5]" />
                  <div>
                    <div className="font-semibold">{entry.label}</div>
                    <div className="text-[0.65rem] text-slate-400">{entry.detail}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
