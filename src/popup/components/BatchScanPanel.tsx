import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  RotateCcw,
  CheckSquare,
  Square,
  Loader,
  BookOpen,
  Check,
  AlertCircle,
  Sparkles,
  Layers,
  History,
  Archive,
  Clock,
} from 'lucide-react';
import type { ScannedPageImage } from '../../content/scanner';
import type { ChapterReaderPage } from '../../content/ChapterReaderModal';
import type { PopupState } from '../../shared/types';
import { db, type ImageRecord } from '../../db';
import { MAX_BATCH_QUEUE_CAPACITY } from '../../shared/constants';
import { getLanguageName } from '../../shared/utils/LanguageRegistry';
import LanguageSelector from './LanguageSelector';

export interface UnifiedGalleryItem {
  id: string; // `page:${url}` or `history:${jobId}`
  source: 'page' | 'history';
  url: string;
  thumbnailUrl: string;
  translatedUrl?: string;
  isTranslated: boolean;
  status: 'idle' | 'queued' | 'downloading' | 'processing' | 'completed' | 'error';
  width: number;
  height: number;
  timestamp?: number;
  jobId?: number;
  /** Language a stored history page was baked for; absent on live page items and on legacy rows. */
  targetLang?: string;
}

interface BatchScanPanelProps {
  state: PopupState;
  updateState: (updates: Partial<PopupState>) => void;
}

interface QueueJobStatus {
  id?: number;
  srcUrl: string;
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'error';
  /** Last transition time; only used when a response row carries no id. */
  timestamp?: number;
}

/**
 * Resolves how recent a queue row is. The queue keeps every row, so row age decides a URL's status:
 * a fresh Retranslate row must outrank the completed row it replaces, and a newer completed row
 * must not stay shadowed by an abandoned older queued row. Response order breaks ties for fixtures
 * that carry no id or timestamp, and `GET_QUEUE_STATUS` returns rows in id order.
 *
 * @param job - Job row returned by the background queue status.
 * @returns The row id, its last-transition timestamp, or -1 when it has neither.
 */
const jobRecency = (job: QueueJobStatus): number => job.id ?? job.timestamp ?? -1;

/** Phases of a forced Retranslate run, rendered on the button that started it. */
type RetranslatePhase = 'idle' | 'running' | 'success' | 'error';

interface RetranslateRun {
  /** URLs this run queued; every one must report a completed job before the run counts as done. */
  urls: string[];
  phase: RetranslatePhase;
}

/** Highest sub-frame id probed when the reader may be embedded in an iframe (Chrome numbers sub-frames from 1). */
const MAX_PROBED_FRAME_ID = 9;

interface FrameScanResult {
  frameId: number;
  pages: ScannedPageImage[];
  connectionError?: string;
}

/**
 * Asks one frame for its chapter pages, treating "no content script in this frame" as an empty result.
 *
 * @param tabId - Target tab id.
 * @param frameId - Frame to ask.
 * @returns Pages that frame reported.
 */
async function scanFrame(tabId: number, frameId: number): Promise<FrameScanResult> {
  try {
    const response = await chrome.tabs.sendMessage(
      tabId,
      { type: 'SCAN_CHAPTER_PAGES', target: 'content', source: 'popup', request: true },
      { frameId }
    );
    const pages = response?.status === 'success' && Array.isArray(response.pages) ? response.pages : [];
    return { frameId, pages };
  } catch (error) {
    return { frameId, pages: [], connectionError: (error as Error)?.message };
  }
}

/**
 * Scans the top frame and the sub-frames that may host an embedded reader, then keeps the
 * frame with the most pages. Frames cannot be enumerated without a permission that adds a
 * browsing-history warning, so a bounded id range is probed instead; every miss is a cheap
 * rejected message.
 *
 * @param tabId - Target tab id.
 * @returns Best frame id, its pages, and the top frame's connection error when it had none.
 */
async function scanBestFrame(tabId: number): Promise<FrameScanResult> {
  const results = await Promise.all(
    Array.from({ length: MAX_PROBED_FRAME_ID + 1 }, (_unused, frameId) => scanFrame(tabId, frameId))
  );
  const best = results.reduce((winner, current) => (current.pages.length > winner.pages.length ? current : winner));
  return { frameId: best.frameId, pages: best.pages, connectionError: results[0].connectionError };
}

/**
 * Batch chapter page scanner, history gallery, and queue manager.
 * Discovers comic strip images on the active reading tab or loads from saved history,
 * displays a unified thumbnail gallery with source provenance, and lets users select
 * and queue pages for translation or launch into distraction-free reader mode.
 *
 * @param props - Popup state and its updater, so the Source/Target pair that drives the queued
 *   pages lives on the tab where the pages are queued.
 * @returns The rendered batch scanner panel.
 */
export default function BatchScanPanel({ state, updateState }: BatchScanPanelProps) {
  const [activeSource, setActiveSource] = useState<'page' | 'history'>('page');
  const [pageItems, setPageItems] = useState<UnifiedGalleryItem[]>([]);
  const [historyItems, setHistoryItems] = useState<UnifiedGalleryItem[]>([]);
  const [selectedMap, setSelectedMap] = useState<Map<string, UnifiedGalleryItem>>(new Map());
  const [isScanning, setIsScanning] = useState(false);
  const [isFastScanning, setIsFastScanning] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [needsTabReload, setNeedsTabReload] = useState(false);
  const [activeJobs, setActiveJobs] = useState<Map<string, string>>(new Map());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  /** Progress of the last forced Retranslate, so the button can report Running/Done instead of silence. */
  const [retranslateRun, setRetranslateRun] = useState<RetranslateRun>({ urls: [], phase: 'idle' });
  const createdUrlsRef = useRef<string[]>([]);
  const mountedRef = useRef(true);
  /** Pages this panel submitted; only their completed job rows describe what this page load shows. */
  const queuedHereRef = useRef(new Set<string>());
  /** Frame the last scan picked; Fast Scan and its cancel request must talk to the same frame. */
  const scanFrameIdRef = useRef(0);

  // Resolves the active tab ID
  const getActiveTab = useCallback(async (): Promise<chrome.tabs.Tab | null> => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch {
      return null;
    }
  }, []);

  // Mirrors the discovery count a running Fast Scan sweep reports from the content script.
  useEffect(() => {
    const listener = (message: { type?: string; target?: string; discovered?: number }): void => {
      if (message?.type !== 'FAST_SCAN_PROGRESS' || message?.target !== 'popup' || !mountedRef.current) return;
      setStatusMessage(`Scanning… found ${message.discovered ?? 0} pages.`);
    };
    chrome.runtime.onMessage?.addListener(listener);
    return () => chrome.runtime.onMessage?.removeListener(listener);
  }, []);

  // Polls background queue for job statuses
  const pollQueueStatus = useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATUS' });
      if (mountedRef.current && res?.status === 'success' && Array.isArray(res.jobs)) {
        const newestJobs = new Map<string, QueueJobStatus>();
        for (const job of res.jobs as QueueJobStatus[]) {
          if (!job.srcUrl) continue;
          const current = newestJobs.get(job.srcUrl);
          if (!current || jobRecency(job) >= jobRecency(current)) {
            newestJobs.set(job.srcUrl, job);
          }
        }
        const jobMap = new Map<string, string>();
        for (const [url, job] of newestJobs) jobMap.set(url, job.status);
        setActiveJobs(jobMap);
      }
    } catch {}
  }, []);

  /**
   * Treats a page as done when the content script reports translated bytes for it, or when a job
   * this panel queued has completed. A completed job row left over from an earlier visit proves
   * nothing: the page reloaded, so its translation is gone from the DOM and the card must offer
   * Translate instead of claiming Done while the artwork is still in the source language.
   *
   * A stored history page only proves it is done for the language it was baked in. Rows written
   * before the language was recorded carry no `targetLang`, and every earlier run used whatever
   * target the popup had at the time, so claiming Done for them is what left an English page on
   * screen after the user switched Target to Thai.
   *
   * @param item - Gallery item to classify.
   * @returns True when the page is translated into the current target language.
   */
  const isItemTranslated = useCallback(
    (item: UnifiedGalleryItem): boolean => {
      if (item.source === 'history' && item.targetLang !== state.targetLang) return false;
      return (
        item.isTranslated ||
        (queuedHereRef.current.has(item.url) && activeJobs.get(item.url) === 'completed')
      );
    },
    [activeJobs, state.targetLang]
  );

  // Loads translation history records from Dexie
  const loadHistoryItems = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      if (!db || !db.translationJobs) {
        if (mountedRef.current) setHistoryItems([]);
        return;
      }
      const jobs = await db.translationJobs.orderBy('timestamp').reverse().limit(60).toArray();
      if (!jobs || jobs.length === 0) {
        if (mountedRef.current) setHistoryItems([]);
        return;
      }

      const jobIds = jobs.map((j) => j.id).filter((id): id is number => typeof id === 'number');
      const images = await db.images.where('jobId').anyOf(jobIds).toArray();
      const imageMap = new Map<number, ImageRecord>();
      for (const img of images) {
        imageMap.set(img.jobId, img);
      }

      const items: UnifiedGalleryItem[] = [];
      for (const job of jobs) {
        if (!job.id) continue;
        const img = imageMap.get(job.id);
        let rawUrl: string | undefined;
        let transUrl: string | undefined;

        if (img?.translatedImageBlob) {
          transUrl = URL.createObjectURL(img.translatedImageBlob);
          createdUrlsRef.current.push(transUrl);
        }
        if (img?.rawImageBlob) {
          rawUrl = URL.createObjectURL(img.rawImageBlob);
          createdUrlsRef.current.push(rawUrl);
        }

        const effectiveUrl = job.srcUrl || rawUrl || '';
        const thumb = transUrl || rawUrl || job.srcUrl || '';
        const isTranslated = Boolean(transUrl) && job.status === 'completed';

        items.push({
          id: `history:${job.id}`,
          source: 'history',
          url: effectiveUrl,
          thumbnailUrl: thumb,
          translatedUrl: transUrl,
          isTranslated,
          status: job.status || (isTranslated ? 'completed' : 'idle'),
          width: 800,
          height: 1200,
          timestamp: job.timestamp,
          jobId: job.id,
          targetLang: job.targetLang,
        });
      }

      if (mountedRef.current) {
        setHistoryItems(items);
      }
    } catch (err) {
      console.warn('[BatchScanPanel] Failed to load history items:', err);
    } finally {
      if (mountedRef.current) setIsLoadingHistory(false);
    }
  }, []);

  // Performs snapshot scan on the active tab
  const scanPages = useCallback(async () => {
    setIsScanning(true);
    setStatusMessage(null);
    try {
      const tab = await getActiveTab();
      if (!tab?.id) {
        setIsScanning(false);
        return;
      }

      const best = await scanBestFrame(tab.id);
      scanFrameIdRef.current = best.frameId;
      if (best.connectionError) setNeedsTabReload(true);

      if (mountedRef.current && Array.isArray(best.pages)) {
        const scanned: ScannedPageImage[] = best.pages;
        const items: UnifiedGalleryItem[] = scanned.map((page) => ({
          id: `page:${page.url}`,
          source: 'page',
          url: page.url,
          thumbnailUrl: page.translatedUrl || page.url,
          translatedUrl: page.translatedUrl,
          isTranslated: page.isTranslated,
          status: page.isTranslated ? 'completed' : 'idle',
          width: page.width,
          height: page.height,
        }));
        setPageItems(items);

        // Pre-select untranslated pages by default
        setSelectedMap((prev) => {
          const next = new Map(prev);
          for (const item of items) {
            if (!item.isTranslated) {
              next.set(item.id, item);
            }
          }
          if (next.size === 0 && items.length > 0) {
            for (const item of items) next.set(item.id, item);
          }
          return next;
        });
      }
    } catch (err: any) {
      console.warn('[BatchScan] Snapshot scan failed:', err);
      const msg = err?.message || String(err);
      if (
        msg.includes('Could not establish connection') ||
        msg.includes('Receiving end does not exist')
      ) {
        setNeedsTabReload(true);
      }
    } finally {
      if (mountedRef.current) setIsScanning(false);
    }
  }, [getActiveTab]);

  // Triggers the content-side sweep that un-lazies and mounts every panel the reader will give it
  const handleFastScan = async () => {
    if (isFastScanning) return;
    setIsFastScanning(true);
    setStatusMessage('Auto-scrolling page to mount lazy comic panels...');
    try {
      const tab = await getActiveTab();
      if (!tab?.id) return;

      // Pick the frame that actually holds the reader before sweeping, so embedded readers are covered.
      const snapshot = await scanBestFrame(tab.id);
      scanFrameIdRef.current = snapshot.frameId;

      const response = await chrome.tabs.sendMessage(
        tab.id,
        {
          type: 'FAST_SCROLL_PRELOAD',
          target: 'content',
          source: 'popup',
          request: true,
        },
        { frameId: snapshot.frameId }
      );

      const pages: ScannedPageImage[] =
        response?.status === 'success' && Array.isArray(response.pages) ? response.pages : snapshot.pages;

      if (mountedRef.current && pages.length > 0) {
        const scanned = pages;
        const items: UnifiedGalleryItem[] = scanned.map((page) => ({
          id: `page:${page.url}`,
          source: 'page',
          url: page.url,
          thumbnailUrl: page.translatedUrl || page.url,
          translatedUrl: page.translatedUrl,
          isTranslated: page.isTranslated,
          status: page.isTranslated ? 'completed' : 'idle',
          width: page.width,
          height: page.height,
        }));
        setPageItems(items);

        // Update selections to include newly discovered untranslated pages
        setSelectedMap((prev) => {
          const next = new Map(prev);
          for (const item of items) {
            if (!item.isTranslated) next.set(item.id, item);
          }
          return next;
        });
        setStatusMessage(
          response?.cancelled
            ? `Scan stopped: kept ${items.length} pages.`
            : `Discovered ${items.length} panels total.`
        );
      }
    } catch (err: any) {
      console.warn('[BatchScan] Fast-scroll preload failed:', err);
      if (String(err?.message ?? err).includes('Could not establish connection')) setNeedsTabReload(true);
      setStatusMessage('Fast-scan encountered an error.');
    } finally {
      if (mountedRef.current) setIsFastScanning(false);
    }
  };

  // Asks the sweeping frame to stop; the content script keeps whatever it already discovered
  const handleCancelFastScan = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    setStatusMessage('Stopping scan…');
    try {
      await chrome.tabs.sendMessage(
        tab.id,
        { type: 'FAST_SCAN_CANCEL', target: 'content', source: 'popup', request: true },
        { frameId: scanFrameIdRef.current }
      );
    } catch {
      // The sweep already finished; the in-flight result still lands.
    }
  };

  // Toggle selection for a single gallery item
  const toggleItemSelection = (item: UnifiedGalleryItem) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      return next;
    });
  };

  // Select all or deselect all items in current view
  const currentViewItems = activeSource === 'page' ? pageItems : historyItems;
  const isAllInViewSelected =
    currentViewItems.length > 0 && currentViewItems.every((item) => selectedMap.has(item.id));

  const toggleSelectAllCurrentView = () => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (isAllInViewSelected) {
        for (const item of currentViewItems) {
          next.delete(item.id);
        }
      } else {
        for (const item of currentViewItems) {
          next.set(item.id, item);
        }
      }
      return next;
    });
  };

  // Smart partition of selected items into pending (untranslated + error) vs already completed.
  // The selection map only stores ids, so resolve them against the live lists: item objects are
  // replaced by later scans and by job/restore updates, and a stale copy would count a finished
  // page as pending and offer to translate it again.
  const liveItemsById = new Map<string, UnifiedGalleryItem>(
    [...pageItems, ...historyItems].map((item) => [item.id, item])
  );
  const selectedList = Array.from(selectedMap.keys())
    .map((id) => liveItemsById.get(id) ?? selectedMap.get(id))
    .filter((item): item is UnifiedGalleryItem => Boolean(item));
  const pendingToTranslate = selectedList.filter(
    (item) => item.status === 'error' || !isItemTranslated(item)
  );
  const skippedCount = selectedList.length - pendingToTranslate.length;

  /**
   * Sends a batch of pages to the background queue and folds the admission report back into the
   * gallery.
   *
   * The panel sends the language pair it is displaying instead of letting the background read it
   * from storage: a popup write can still be in flight when Translate is pressed right after
   * changing Target, and the response echoes the language that was actually queued so a wrong
   * direction would be visible here rather than on the finished page.
   *
   * @param urlsToQueue - Image URLs in reading order.
   * @param force - Ignore stored pages and translate them again (the Retranslate action).
   * @returns Nothing; feedback is rendered from the queue response.
   */
  const dispatchBatchQueue = async (urlsToQueue: string[], force: boolean): Promise<void> => {
    if (isQueueing || urlsToQueue.length === 0) return;
    setIsQueueing(true);
    setStatusMessage(force ? 'Re-translating pages…' : 'Queueing pages for translation...');

    const requestedTargetLang = state.targetLang;
    try {
      const tab = await getActiveTab();
      const res = await chrome.runtime.sendMessage({
        type: 'BATCH_QUEUE_TRANSLATIONS',
        payload: { urls: urlsToQueue, targetLang: requestedTargetLang, force },
        tabId: tab?.id,
      });

      if (res?.status === 'success') {
        // Language the background actually queued, not the one this panel hoped for.
        const queuedLang: string = res.targetLang ?? requestedTargetLang;
        const queuedLangName = getLanguageName(queuedLang);
        // Pages the background restored from storage are already translated on the page: they get
        // no job row, so they must show Done instead of spinning on a job that will never exist.
        const restoredUrls = new Set<string>(res.restoredUrls ?? []);
        // Pages the background capacity guard refused get no job row, so they can never report
        // progress. Marking them "error" surfaces Retry and keeps them in the next batch instead
        // of leaving a spinner on a page that will never translate.
        const rejectedUrls = new Set<string>(res.rejectedUrls ?? []);
        const count = res.queuedCount ?? urlsToQueue.length - rejectedUrls.size - restoredUrls.size;
        const queuedUrls = urlsToQueue.filter((url) => !rejectedUrls.has(url) && !restoredUrls.has(url));
        // A forced run replaces what the page shows today: drop the old status so the card reports the
        // new job's progress instead of the previous run's completed row.
        if (force) {
          setActiveJobs((prev) => {
            const next = new Map(prev);
            for (const url of queuedUrls) next.delete(url);
            return next;
          });
          setRetranslateRun({ urls: queuedUrls, phase: queuedUrls.length > 0 ? 'running' : 'idle' });
        } else if (retranslateRun.phase === 'success' || retranslateRun.phase === 'error') {
          setRetranslateRun({ urls: [], phase: 'idle' });
        }
        if (rejectedUrls.size > 0) {
          setStatusMessage(
            `Queued ${count} of ${urlsToQueue.length} pages → ${queuedLangName} — queue limit ${res.capacity ?? MAX_BATCH_QUEUE_CAPACITY} reached. Press Translate again as pages finish.`
          );
        } else if (restoredUrls.size > 0) {
          setStatusMessage(
            count > 0
              ? `Restored ${restoredUrls.size} already translated pages. Queued ${count} pages → ${queuedLangName} — starting sequential translation.`
              : `Restored ${restoredUrls.size} already translated pages — nothing left to translate.`
          );
        } else {
          setStatusMessage(
            `${force ? 'Re-translating' : 'Queued'} ${count} pages → ${queuedLangName}. Starting sequential translation.`
          );
        }

        for (const url of urlsToQueue) {
          if (rejectedUrls.has(url) || restoredUrls.has(url)) continue;
          queuedHereRef.current.add(url);
        }

        const nextStatus = (item: UnifiedGalleryItem) => {
          if (!urlsToQueue.includes(item.url)) return item;
          if (restoredUrls.has(item.url)) {
            return {
              ...item,
              isTranslated: true,
              status: 'completed' as UnifiedGalleryItem['status'],
              targetLang: queuedLang,
            };
          }
          return {
            ...item,
            status: (rejectedUrls.has(item.url) ? 'error' : 'queued') as UnifiedGalleryItem['status'],
            targetLang: queuedLang,
          };
        };
        setPageItems((prev) => prev.map(nextStatus));
        setHistoryItems((prev) => prev.map(nextStatus));

        // Ask now instead of waiting for the 2s interval: the background starts page #1 as it
        // queues, so the first card flips to Processing while the rest report Queued.
        void pollQueueStatus();
      } else {
        setStatusMessage(res?.error || 'Failed to queue translations.');
        if (force) setRetranslateRun({ urls: [], phase: 'idle' });
      }
    } catch (err: any) {
      console.warn('[BatchScan] Queue dispatch failed:', err);
      setStatusMessage('Error sending translations to background queue.');
      if (force) setRetranslateRun({ urls: [], phase: 'idle' });
    } finally {
      if (mountedRef.current) setIsQueueing(false);
    }
  };

  // Queues the selection that is not translated into the current target language yet.
  const handleQueueSelected = async () => {
    await dispatchBatchQueue(
      pendingToTranslate.map((item) => item.url).filter(Boolean),
      false
    );
  };

  // Queues every selected page again, ignoring the Done state and every stored page.
  const handleRetranslateSelected = async () => {
    await dispatchBatchQueue(
      selectedList.map((item) => item.url).filter(Boolean),
      true
    );
  };

  // Opens Chapter Reader for selected pages, or all pages in view if none selected
  const handleOpenReaderForSelected = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) return;

      const targetItems = selectedList.length > 0 ? selectedList : currentViewItems;

      if (targetItems.length === 0) {
        await chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'OPEN_CHAPTER_READER',
            target: 'content',
            source: 'popup',
            request: true,
          },
          { frameId: 0 }
        );
        window.close();
        return;
      }

      const pagesPayload: ChapterReaderPage[] = targetItems.map((item, idx) => ({
        id: item.id,
        url: item.url,
        width: item.width || 800,
        height: item.height || 1200,
        top: idx * (item.height || 1200),
        isTranslated: item.isTranslated,
        translatedUrl: item.translatedUrl,
        jobId: item.jobId,
        status: item.status === 'downloading' ? 'processing' : item.status,
      }));

      await chrome.tabs.sendMessage(
        tab.id,
        {
          type: 'OPEN_CHAPTER_READER',
          target: 'content',
          source: 'popup',
          request: true,
          payload: { pages: pagesPayload },
        },
        { frameId: 0 }
      );
      window.close();
    } catch (err) {
      console.warn('[Popup] Failed to open chapter reader from batch panel:', err);
    }
  };

  // Exports selected or available translated pages as ZIP archive
  const handleExportZipForSelected = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) return;

      const targetItems = selectedList.length > 0 ? selectedList : currentViewItems;
      const readyItems = targetItems.filter((item) => item.isTranslated && item.translatedUrl);

      if (readyItems.length === 0) {
        setStatusMessage('No translated pages ready to export.');
        return;
      }

      setIsExportingZip(true);
      setStatusMessage(`Preparing ${readyItems.length} pages for ZIP export…`);

      const recordsToExport = readyItems.map((item, idx) => ({
        originalUrl: item.url,
        translatedUrl: item.translatedUrl!,
        sourcePage: item.source === 'page' ? (tab.url || '') : 'history',
        documentPath: null,
        documentY: idx * 1000,
        sequence: idx + 1,
      }));

      const res = await chrome.tabs.sendMessage(
        tab.id,
        {
          type: 'EXPORT_CHAPTER_ZIP',
          target: 'content',
          source: 'popup',
          request: true,
          payload: { records: recordsToExport },
        },
        { frameId: 0 }
      );

      if (res?.phase === 'error') {
        setStatusMessage(res.message || 'ZIP Export failed.');
      } else {
        setStatusMessage(`ZIP Download started (${readyItems.length} pages).`);
      }
    } catch (err: any) {
      console.warn('[BatchScan] Export ZIP dispatch failed:', err);
      setStatusMessage('Failed to trigger ZIP export on active tab.');
    } finally {
      if (mountedRef.current) setIsExportingZip(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void scanPages();
    void loadHistoryItems();
    void pollQueueStatus();
    const timer = setInterval(() => {
      void pollQueueStatus();
    }, 2000);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      for (const u of createdUrlsRef.current) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
      createdUrlsRef.current = [];
    };
  }, [scanPages, loadHistoryItems, pollQueueStatus]);

  // Retranslate feedback: the queue has no completion callback, so a forced run counts as finished
  // only once the poll reports a completed job for every URL that run queued.
  useEffect(() => {
    if (retranslateRun.phase !== 'running' || retranslateRun.urls.length === 0) return;
    const statuses = retranslateRun.urls.map((url) => activeJobs.get(url));
    if (statuses.some((status) => status === 'error')) {
      setRetranslateRun({ urls: [], phase: 'error' });
      setStatusMessage('Retranslate failed on some pages — press Retranslate to try them again.');
      return;
    }
    if (!statuses.every((status) => status === 'completed')) return;
    const pageCount = retranslateRun.urls.length;
    setRetranslateRun({ urls: [], phase: 'success' });
    setStatusMessage(
      `Successfully translated ${pageCount} page${pageCount === 1 ? '' : 's'} → ${getLanguageName(state.targetLang)}.`
    );
  }, [activeJobs, retranslateRun, state.targetLang]);

  const selectedCountInView = currentViewItems.filter((item) => selectedMap.has(item.id)).length;
  const totalTranslatedInView = currentViewItems.filter((item) => item.isTranslated).length;
  const readyToExportCount = selectedList.length > 0
    ? selectedList.filter((item) => item.isTranslated && item.translatedUrl).length
    : totalTranslatedInView;

  return (
    <div className="flex flex-col gap-2.5 text-xs">
      {/* Language pair belongs to the pages this tab queues: changing it here re-opens pages that
          were only translated for the previous target language. */}
      <LanguageSelector state={state} updateState={updateState} />

      {/* Dual-Source Segmented Control Switcher */}
      <div className="flex p-0.5 rounded-lg bg-[var(--color-paper)] border border-[var(--color-dust)] border-opacity-30 text-xs">
        <button
          type="button"
          onClick={() => setActiveSource('page')}
          className={`flex-1 py-1 px-1.5 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap text-[11px] ${
            activeSource === 'page'
              ? 'bg-[var(--color-vellum)] text-[var(--color-ink)] shadow-sm'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          <Layers size={13} className={activeSource === 'page' ? 'text-[var(--color-editorial)]' : ''} />
          <span>Current Page</span>
          <span className="font-mono text-[10px] opacity-75 font-normal">({pageItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveSource('history');
            void loadHistoryItems();
          }}
          className={`flex-1 py-1 px-1.5 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap text-[11px] ${
            activeSource === 'history'
              ? 'bg-[var(--color-vellum)] text-[var(--color-ink)] shadow-sm'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          <History size={13} className={activeSource === 'history' ? 'text-[var(--color-editorial)]' : ''} />
          <span>History</span>
          <span className="font-mono text-[10px] opacity-75 font-normal">({historyItems.length})</span>
        </button>
      </div>

      {/* Top Controls Toolbar */}
      <div className="p-2.5 rounded bg-[var(--color-vellum)] border border-[var(--color-dust)] border-opacity-30 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer font-medium select-none min-w-0">
          <input
            type="checkbox"
            checked={isAllInViewSelected}
            onChange={toggleSelectAllCurrentView}
            disabled={currentViewItems.length === 0}
            className="rounded border-[var(--color-dust)] text-[var(--color-editorial)] focus:ring-0 cursor-pointer"
          />
          <span className="font-mono text-[11px] text-[var(--color-ink)] truncate">
            {selectedCountInView} / {currentViewItems.length} pages
            {selectedList.length > 0 && selectedList.length !== selectedCountInView && (
              <span className="text-[var(--color-editorial)] font-semibold ml-1">
                ({selectedList.length} total selected)
              </span>
            )}
          </span>
        </label>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeSource === 'page' ? (
            <>
              <button
                onClick={scanPages}
                disabled={isScanning || isFastScanning}
                className="p-1 rounded hover:bg-[var(--color-paper)] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
                title="Rescan current page DOM"
              >
                <RotateCcw size={14} className={isScanning ? 'animate-spin' : ''} />
              </button>

              <button
                onClick={isFastScanning ? handleCancelFastScan : handleFastScan}
                disabled={isScanning}
                className="px-2 py-1 rounded bg-[var(--color-paper)] hover:bg-[var(--color-accent-fill)] hover:text-white border border-[var(--color-dust)] border-opacity-30 font-semibold transition-all flex items-center gap-1 text-[11px] cursor-pointer shadow-sm disabled:opacity-50"
                title={
                  isFastScanning
                    ? 'Stop the sweep and keep the pages found so far'
                    : 'Scroll the reader and collect every page it mounts (lazy, virtualized or paged)'
                }
              >
                {isFastScanning ? (
                  <Square size={12} className="fill-current" />
                ) : (
                  <Zap size={12} className="text-amber-500" />
                )}
                <span>{isFastScanning ? 'Stop' : 'Fast Scan'}</span>
              </button>
            </>
          ) : (
            <button
              onClick={loadHistoryItems}
              disabled={isLoadingHistory}
              className="px-2 py-1 rounded bg-[var(--color-paper)] hover:bg-[var(--color-accent-fill)] hover:text-white border border-[var(--color-dust)] border-opacity-30 font-semibold transition-all flex items-center gap-1 text-[11px] cursor-pointer shadow-sm disabled:opacity-50"
              title="Refresh saved translation history"
            >
              <RotateCcw size={12} className={isLoadingHistory ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Reload Needed Prompt */}
      {needsTabReload && activeSource === 'page' && (
        <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
            <div className="text-[11px] leading-snug">
              <p className="font-semibold text-[var(--color-ink)]">Extension Updated</p>
              <p className="opacity-80 mt-0.5">Please reload this tab to connect the updated extension.</p>
            </div>
          </div>
          <button
            onClick={async () => {
              const tab = await getActiveTab();
              if (tab?.id) {
                chrome.tabs.reload(tab.id);
                window.close();
              }
            }}
            className="w-full py-1 bg-amber-500 text-black font-bold rounded text-[11px] cursor-pointer hover:bg-amber-400 transition-colors shadow-sm"
          >
            Reload Tab Now
          </button>
        </div>
      )}

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div className="py-1 px-2 rounded bg-[var(--color-paper)] text-[10px] text-[var(--color-muted)] border border-[var(--color-dust)] border-opacity-20 flex items-center gap-1.5 animate-fadeIn">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-fill)] shrink-0 animate-ping" />
          <span className="truncate">{statusMessage}</span>
        </div>
      )}

      {/* Scrollable Thumbnail Gallery */}
      <div className="max-h-72 overflow-y-auto pr-1">
        {isScanning || (activeSource === 'history' && isLoadingHistory && historyItems.length === 0) ? (
          <div className="py-12 flex flex-col items-center justify-center text-[var(--color-muted)] gap-2">
            <Loader size={20} className="animate-spin text-[var(--color-editorial)]" />
            <span className="text-[11px]">
              {activeSource === 'page' ? 'Detecting comic panels on page…' : 'Loading saved history…'}
            </span>
          </div>
        ) : currentViewItems.length === 0 ? (
          <div className="py-8 px-4 flex flex-col items-center justify-center text-center text-[var(--color-muted)]">
            <BookOpen size={28} className="mb-2 opacity-50" />
            <p className="font-semibold text-xs text-[var(--color-ink)]">
              {activeSource === 'page' ? 'No Comic Panels Detected' : 'No Saved History Yet'}
            </p>
            <p className="text-[11px] mt-1 leading-relaxed opacity-80">
              {activeSource === 'page'
                ? 'Try running Fast Scan to scroll through virtualized readers, or check page elements.'
                : 'Translated images will automatically save here so you can re-open or export them later.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {currentViewItems.map((item, idx) => {
              const isSelected = selectedMap.has(item.id);
              const jobStatus = activeJobs.get(item.url) || item.status;
              const isProcessing = jobStatus === 'processing' || jobStatus === 'downloading';
              const isQueued = jobStatus === 'queued';
              const isDone = isItemTranslated(item);
              const isError = jobStatus === 'error' || item.status === 'error';

              return (
                <div
                  key={item.id}
                  onClick={() => toggleItemSelection(item)}
                  className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'border-[var(--color-editorial)] shadow-md ring-1 ring-[var(--color-editorial)] ring-opacity-50'
                      : 'border-[var(--color-dust)] border-opacity-30 hover:border-opacity-60 bg-[var(--color-paper)]'
                  }`}
                >
                  {/* Badge: Index & Source Provenance */}
                  <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
                    <span className="bg-black/75 backdrop-blur text-white text-[9px] font-mono px-1.5 py-0.5 rounded font-bold">
                      #{idx + 1}
                    </span>
                    <span
                      className={`text-[8px] font-semibold uppercase px-1 py-0.5 rounded backdrop-blur ${
                        item.source === 'history'
                          ? 'bg-purple-900/80 text-purple-200 border border-purple-400/30'
                          : 'bg-slate-900/80 text-slate-300 border border-slate-500/30'
                      }`}
                    >
                      {item.source}
                    </span>
                  </div>

                  {/* Checkbox */}
                  <div className="absolute top-1 right-1 z-10 bg-black/60 backdrop-blur rounded p-0.5">
                    {isSelected ? (
                      <CheckSquare size={14} className="text-[var(--color-editorial)]" />
                    ) : (
                      <Square size={14} className="text-white/60" />
                    )}
                  </div>

                  {/* Image Preview Container */}
                  <div className="w-full h-32 bg-black/20 flex items-center justify-center overflow-hidden relative">
                    <img
                      src={item.thumbnailUrl}
                      alt={`Page ${idx + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = '0.3';
                      }}
                    />

                    {/* Status Overlay Badge */}
                    <div className="absolute bottom-1 right-1 bg-black/80 backdrop-blur text-white text-[9px] font-mono px-1 py-0.5 rounded flex items-center gap-1">
                      {/* A running job outranks the Done badge: a page translated earlier still shows
                          its old artwork until the new job lands, so claiming Done hides the work. */}
                      {isProcessing ? (
                        <>
                          <Loader size={10} className="animate-spin text-amber-400" />
                          <span className="text-amber-300 font-semibold">Processing</span>
                        </>
                      ) : isQueued ? (
                        <>
                          <Clock size={10} className="text-sky-400" />
                          <span className="text-sky-300 font-semibold">Queued</span>
                        </>
                      ) : isDone ? (
                        <>
                          <Check size={10} className="text-emerald-400" />
                          <span className="text-emerald-300 font-semibold">Done</span>
                        </>
                      ) : isError ? (
                        <>
                          <AlertCircle size={10} className="text-rose-400" />
                          <span className="text-rose-300 font-semibold">Retry</span>
                        </>
                      ) : (
                        <span className="opacity-75">Ready</span>
                      )}
                    </div>
                  </div>

                  {/* Dimension / Timestamp Footer */}
                  <div className="px-1.5 py-1 flex items-center justify-between text-[10px] font-mono text-[var(--color-muted)] bg-[var(--color-paper)] border-t border-[var(--color-dust)] border-opacity-20">
                    <span>
                      {item.source === 'history' && item.timestamp
                        ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : item.width > 0
                        ? `${item.width}×${item.height}`
                        : '...'}
                    </span>
                    {isProcessing ? (
                      <span className="text-amber-500 font-bold">Translating</span>
                    ) : isQueued ? (
                      <span className="text-sky-500 font-bold">Queued</span>
                    ) : isDone ? (
                      <span className="text-emerald-500 font-bold">Translated</span>
                    ) : isError ? (
                      <span className="text-rose-400 font-bold">Failed</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex flex-col gap-2 pt-1">
        {/* Smart Translate Button (Skips Already Translated, Retries Failed) */}
        <button
          onClick={handleQueueSelected}
          disabled={isQueueing || pendingToTranslate.length === 0 || selectedList.length === 0}
          className="w-full py-2 bg-[var(--color-accent-fill)] text-white font-bold rounded hover:opacity-90 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:bg-[var(--color-vellum)] disabled:text-[var(--color-muted)] disabled:shadow-none disabled:cursor-not-allowed text-xs"
        >
          {isQueueing ? (
            <Loader size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          <span>
            {isQueueing
              ? 'Queueing Pages…'
              : selectedList.length === 0
              ? 'Select Pages to Translate'
              : pendingToTranslate.length > 0
              ? skippedCount > 0
                ? `Translate ${pendingToTranslate.length} Pages (${skippedCount} already done)`
                : `Translate ${pendingToTranslate.length} Selected Pages`
              : `All ${selectedList.length} Selected Pages Done`}
          </span>
        </button>

        {/* Retranslate: the escape hatch from a page that already shows the wrong run. It ignores
            both the Done state and every stored page, so a selection baked in another language (or
            before the language was recorded) is translated again instead of being restored. */}
        <button
          onClick={handleRetranslateSelected}
          disabled={isQueueing || selectedList.length === 0}
          className={`w-full py-1.5 px-2 font-semibold rounded border transition-colors flex items-center justify-center gap-1.5 text-xs cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
            retranslateRun.phase === 'success'
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600'
              : retranslateRun.phase === 'error'
              ? 'bg-rose-500/10 border-rose-500 text-rose-600'
              : 'bg-[var(--color-vellum)] text-[var(--color-ink)] border-[var(--color-dust)] border-opacity-30 hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)]'
          }`}
          title={
            retranslateRun.phase === 'success'
              ? `Successfully translated into ${getLanguageName(state.targetLang)} — press again to translate these pages one more time`
              : retranslateRun.phase === 'running'
              ? `Translating ${retranslateRun.urls.length} page(s) again into ${getLanguageName(state.targetLang)}`
              : selectedList.length === 0
              ? 'Select the pages to translate again'
              : `Ignore saved pages and translate ${selectedList.length} selected pages again into ${getLanguageName(state.targetLang)}`
          }
        >
          {retranslateRun.phase === 'running' ? (
            <Loader size={13} className="animate-spin text-amber-500 shrink-0" />
          ) : retranslateRun.phase === 'success' ? (
            <Check size={13} className="text-emerald-600 shrink-0" />
          ) : (
            <RotateCcw size={13} className="text-[var(--color-editorial)] shrink-0" />
          )}
          <span className="truncate">
            {retranslateRun.phase === 'running'
              ? 'Retranslating…'
              : retranslateRun.phase === 'success'
              ? 'Successfully translated'
              : selectedList.length === 0
              ? 'Retranslate Selected Pages'
              : `Retranslate ${selectedList.length} Page${selectedList.length === 1 ? '' : 's'} → ${getLanguageName(state.targetLang)}`}
          </span>
        </button>

        {/* Secondary Action Row: Open Reader & Export ZIP (Permanent, Never Disappears) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleOpenReaderForSelected}
            className="py-1.5 px-2 bg-[var(--color-vellum)] text-[var(--color-ink)] border border-[var(--color-dust)] border-opacity-30 font-semibold rounded hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] transition-colors flex items-center justify-center gap-1.5 text-xs cursor-pointer shadow-sm truncate"
            title={
              selectedList.length > 0
                ? `Open reader displaying ${selectedList.length} selected pages`
                : `Open reader displaying all ${currentViewItems.length} pages`
            }
          >
            <BookOpen size={13} className="text-[var(--color-editorial)] shrink-0" />
            <span className="truncate">
              {selectedList.length > 0
                ? `Reader (${selectedList.length})`
                : `Open Reader (${currentViewItems.length})`}
            </span>
          </button>

          <button
            onClick={handleExportZipForSelected}
            disabled={isExportingZip || readyToExportCount === 0}
            className="py-1.5 px-2 bg-[var(--color-vellum)] text-[var(--color-ink)] border border-[var(--color-dust)] border-opacity-30 font-semibold rounded hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] transition-colors flex items-center justify-center gap-1.5 text-xs cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed truncate"
            title={
              readyToExportCount === 0
                ? 'No translated pages ready to export yet'
                : `Download ${readyToExportCount} translated page${readyToExportCount === 1 ? '' : 's'} as ZIP`
            }
          >
            {isExportingZip ? (
              <Loader size={13} className="animate-spin text-[var(--color-editorial)] shrink-0" />
            ) : (
              <Archive size={13} className="text-[var(--color-editorial)] shrink-0" />
            )}
            <span className="truncate">
              {isExportingZip
                ? 'Exporting…'
                : `Export ZIP (${readyToExportCount})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
