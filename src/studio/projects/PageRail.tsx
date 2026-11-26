import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers, Plus } from 'lucide-react';
import { db, type ProjectFolder, type TranslationJob } from '../../db';
import type { HistoryLayoutMode } from '../state/historyFilter';
import { PageRailHistoryList } from './PageRailHistoryList';
import { PageRailProjectList, PageRailProjectPicker } from './PageRailProjectList';

/** Props for the dual-mode History/Project page rail. */
export interface PageRailProps {
  /** Active project; omitted means the rail starts on History and can still open projects. */
  projectId?: number;
  /** Preloaded history jobs; the rail queries IndexedDB when omitted. */
  allJobs?: TranslationJob[];
  /** Projects offered by the Project tab picker and quick assignment. */
  projects?: ProjectFolder[];
  /** Page currently open in the canvas. */
  activeJobId?: number;
  /** Forces a reload after library mutations. */
  refreshKey?: number;
  /** Opens a page in the canvas editor. */
  onSelectPage: (jobId: number) => void;
  /** Opens a project from the Project tab picker. */
  onSelectProject?: (projectId: number) => void;
  /** Opens the add-pages-from-library dialog for the active project. */
  onOpenAddFromLibrary?: () => void;
  /** Assigns a history page to a project from the rail. */
  onAssignPageToProject?: (jobId: number, projectId: number) => void;
}

/** Rail-level tab identifiers. */
type PageRailTab = 'history' | 'project';

/**
 * Renders the Canvas page rail: always-available History browsing plus the
 * ordered view of the active project.
 *
 * @param props - Project context, history data, selection, and action callbacks.
 * @returns Collapsible rail with History and Project tabs.
 */
export const PageRail: React.FC<PageRailProps> = ({
  projectId,
  allJobs,
  projects,
  activeJobId,
  refreshKey = 0,
  onSelectPage,
  onSelectProject,
  onOpenAddFromLibrary,
  onAssignPageToProject,
}) => {
  const [activeTab, setActiveTab] = useState<PageRailTab>(projectId === undefined ? 'history' : 'project');
  const [layoutMode, setLayoutMode] = useState<HistoryLayoutMode>('strip');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [historyCount, setHistoryCount] = useState(allJobs?.length ?? 0);
  const [projectCount, setProjectCount] = useState(0);

  useEffect(() => {
    setActiveTab(projectId === undefined ? 'history' : 'project');
  }, [projectId]);

  useEffect(() => {
    if (allJobs) {
      setHistoryCount(allJobs.length);
      return;
    }
    let isCancelled = false;
    void db.translationJobs.count().then((count) => {
      if (!isCancelled) setHistoryCount(count);
    }).catch(() => {
      if (!isCancelled) setHistoryCount(0);
    });
    return () => {
      isCancelled = true;
    };
  }, [allJobs, refreshKey]);

  useEffect(() => {
    if (projectId === undefined) {
      setProjectCount(0);
      return;
    }
    let isCancelled = false;
    void db.translationJobs.where('folderId').equals(projectId).count().then((count) => {
      if (!isCancelled) setProjectCount(count);
    }).catch(() => {
      if (!isCancelled) setProjectCount(0);
    });
    return () => {
      isCancelled = true;
    };
  }, [projectId, refreshKey]);

  const activeCount = activeTab === 'history' ? historyCount : projectCount;
  const railWidth = activeTab === 'history' && layoutMode === 'grid' ? 'w-72' : 'w-48';

  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center justify-between py-2 px-1 bg-[#12141c] border border-[#262a3b] rounded-xl shadow-2xl shrink-0 z-30 select-none">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1c1f2e] transition cursor-pointer"
          title="Expand Pages Rail"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold text-slate-400 tracking-wider">
          {activeCount} Pages
        </div>
        <div />
      </div>
    );
  }

  return (
    <aside className={`${railWidth} h-full bg-[#12141c] border border-[#262a3b] rounded-xl shadow-2xl flex flex-col overflow-hidden shrink-0 z-30 select-none transition-[width]`}>
      <div className="h-9 px-2 border-b border-[#262a3b] bg-[#141724] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 min-w-0">
          <Layers className="w-3.5 h-3.5 text-[#60c1e5] shrink-0" />
          <span>Pages ({activeCount})</span>
        </div>
        <div className="flex items-center gap-1">
          {activeTab === 'project' && projectId !== undefined && onOpenAddFromLibrary && (
            <button
              type="button"
              onClick={onOpenAddFromLibrary}
              className="p-1 rounded-md text-[#60c1e5] hover:text-white hover:bg-[#005a9c] transition cursor-pointer"
              title="Add pages from library"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#1c1f2e] transition cursor-pointer"
            title="Collapse rail"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-1.5 py-1.5 border-b border-[#262a3b] bg-[#141724] shrink-0">
        <div role="tablist" aria-label="Page rail view" className="flex items-center p-0.5 rounded-md bg-[#090a0f] border border-[#262a3b]">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-2 py-1 rounded text-[0.65rem] font-semibold transition cursor-pointer ${
              activeTab === 'history' ? 'bg-[#005a9c] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            History
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'project'}
            onClick={() => setActiveTab('project')}
            className={`flex-1 px-2 py-1 rounded text-[0.65rem] font-semibold transition cursor-pointer ${
              activeTab === 'project' ? 'bg-[#005a9c] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Project
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <PageRailHistoryList
          allJobs={allJobs}
          projects={projects}
          activeJobId={activeJobId}
          refreshKey={refreshKey}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          onSelectPage={onSelectPage}
          onAssignPageToProject={onAssignPageToProject}
        />
      ) : projectId !== undefined ? (
        <PageRailProjectList
          projectId={projectId}
          activeJobId={activeJobId}
          refreshKey={refreshKey}
          onSelectPage={onSelectPage}
          onOpenAddFromLibrary={onOpenAddFromLibrary}
        />
      ) : (
        <PageRailProjectPicker
          projects={projects ?? []}
          onSelectProject={onSelectProject}
          onBrowseHistory={() => setActiveTab('history')}
        />
      )}
    </aside>
  );
};
