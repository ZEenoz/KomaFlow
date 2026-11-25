import { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, Eye, EyeOff, ScanLine } from 'lucide-react';
import type { ChapterZipStatus } from '../../content/chapterZip';
import { sendToActiveTopFrame } from '../services/topFrameMessaging';

/** Poll cadence for translated-page and original-view readiness. */
const PAGE_STATE_POLL_INTERVAL_MS = 2500;

interface HomeQuickActionsProps {
  onOpenBatch: () => void;
}

interface PageOriginalStateResponse {
  status?: string;
  hasTranslated?: boolean;
  showOriginal?: boolean;
}

/**
 * Renders the primary Home actions plus the page-original toggle when translations exist.
 *
 * @param props - Batch navigation callback.
 * @returns The quick-action controls.
 */
export default function HomeQuickActions({ onOpenBatch }: HomeQuickActionsProps) {
  const [translatedPages, setTranslatedPages] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [toggling, setToggling] = useState(false);
  const mountedRef = useRef(true);

  const refreshPageState = useCallback(async () => {
    const [zip, originals] = await Promise.all([
      sendToActiveTopFrame<ChapterZipStatus>('GET_CHAPTER_ZIP_STATUS'),
      sendToActiveTopFrame<PageOriginalStateResponse>('GET_PAGE_ORIGINAL_STATE'),
    ]);
    if (!mountedRef.current) return;
    setTranslatedPages(zip?.total ?? 0);
    if (originals) setShowOriginal(Boolean(originals.hasTranslated && originals.showOriginal));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshPageState();
    const timer = setInterval(() => void refreshPageState(), PAGE_STATE_POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refreshPageState]);

  /** @returns Nothing; starts the content-side crop selection on the active tab. */
  const handleCropArea = async (): Promise<void> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'START_AREA_SELECTION' });
        window.close();
      }
    } catch (error) {
      console.warn('[Popup] Failed to start area selection on active tab:', error);
    }
  };

  /** @returns Nothing; toggles all translated images on the active page. */
  const handleToggleOriginals = async (): Promise<void> => {
    if (toggling) return;
    setToggling(true);
    try {
      const result = await sendToActiveTopFrame<PageOriginalStateResponse>('TOGGLE_PAGE_ORIGINALS');
      if (result?.status === 'success' && mountedRef.current) {
        setShowOriginal(Boolean(result.showOriginal));
      }
    } finally {
      if (mountedRef.current) setToggling(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenBatch}
          title="Scan this chapter and queue page translations"
          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-vellum)] px-2 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] cursor-pointer"
        >
          <ScanLine size={15} className="shrink-0" />
          Scan Chapter
        </button>
        <button
          type="button"
          onClick={() => void handleCropArea()}
          title="Drag a rectangle across any manga panel, canvas, or video to translate it"
          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-vellum)] px-2 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] cursor-pointer"
        >
          <Crop size={15} className="shrink-0" />
          Crop Area
        </button>
      </div>

      {translatedPages > 0 ? (
        <button
          type="button"
          onClick={() => void handleToggleOriginals()}
          disabled={toggling}
          aria-pressed={showOriginal}
          title={showOriginal ? 'Show the translated artwork' : 'Show the original artwork'}
          className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-md border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-paper)] px-2 py-1 text-[11px] font-semibold text-[var(--color-muted)] transition-colors hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] disabled:opacity-50 cursor-pointer"
        >
          {showOriginal ? <EyeOff size={13} className="shrink-0" /> : <Eye size={13} className="shrink-0" />}
          {showOriginal ? 'Show Translated' : 'Show Original'}
        </button>
      ) : null}
    </div>
  );
}
