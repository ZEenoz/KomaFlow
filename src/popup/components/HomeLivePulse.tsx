import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, BookOpen, ChevronRight, Loader } from 'lucide-react';
import type { ChapterZipStatus } from '../../content/chapterZip';
import { sendToActiveTopFrame } from '../services/topFrameMessaging';

/** Poll cadence for the background queue summary. */
const QUEUE_POLL_INTERVAL_MS = 2500;
/** Poll cadence for chapter readiness while ZIP export is idle. */
const ZIP_IDLE_POLL_INTERVAL_MS = 2000;
/** Poll cadence while a ZIP export is running. */
const ZIP_BUSY_POLL_INTERVAL_MS = 400;

interface QueueJobStatus {
  id?: number;
  srcUrl?: string;
  status?: 'queued' | 'downloading' | 'processing' | 'completed' | 'error';
  timestamp?: number;
}

interface QueueStatusResponse {
  status?: string;
  jobs?: QueueJobStatus[];
}

interface QueueCounts {
  processing: number;
  queued: number;
  done: number;
}

interface HomeLivePulseProps {
  onOpenBatch: () => void;
}

/**
 * Orders duplicate queue rows by their last transition, matching the Batch panel.
 *
 * @param job - Queue row.
 * @returns Its transition id/timestamp, or -1 when absent.
 */
function jobRecency(job: QueueJobStatus): number {
  return job.id ?? job.timestamp ?? -1;
}

/**
 * Counts the newest queue row per source URL.
 *
 * @param jobs - Raw queue rows.
 * @returns Processing, queued, and completed counts.
 */
function countQueueJobs(jobs: readonly QueueJobStatus[]): QueueCounts {
  const newest = new Map<string, QueueJobStatus>();
  for (const job of jobs) {
    if (!job.srcUrl) continue;
    const current = newest.get(job.srcUrl);
    if (!current || jobRecency(job) >= jobRecency(current)) newest.set(job.srcUrl, job);
  }

  const counts: QueueCounts = { processing: 0, queued: 0, done: 0 };
  for (const job of newest.values()) {
    if (job.status === 'processing' || job.status === 'downloading') counts.processing += 1;
    else if (job.status === 'queued') counts.queued += 1;
    else if (job.status === 'completed') counts.done += 1;
  }
  return counts;
}

/**
 * Reads the background translation queue for the active Home pulse.
 *
 * @returns Queue rows, or an empty list when the runtime is unreachable.
 */
async function fetchQueueJobs(): Promise<QueueJobStatus[]> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return [];
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_QUEUE_STATUS',
    }) as QueueStatusResponse;
    return response?.status === 'success' && Array.isArray(response.jobs) ? response.jobs : [];
  } catch {
    return [];
  }
}

/**
 * Contextual Home pulse for active jobs and translated chapter pages.
 *
 * @param props - Batch navigation callback.
 * @returns The live pulse, or null when the active tab has nothing in flight or translated.
 */
export default function HomeLivePulse({ onOpenBatch }: HomeLivePulseProps) {
  const [jobs, setJobs] = useState<QueueJobStatus[]>([]);
  const [zipStatus, setZipStatus] = useState<ChapterZipStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const mountedRef = useRef(true);
  const exportingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshQueue = useCallback(async () => {
    const nextJobs = await fetchQueueJobs();
    if (mountedRef.current) setJobs(nextJobs);
  }, []);

  const refreshZipStatus = useCallback(async () => {
    const status = await sendToActiveTopFrame<ChapterZipStatus>('GET_CHAPTER_ZIP_STATUS');
    if (mountedRef.current) setZipStatus(status);
  }, []);

  useEffect(() => {
    void refreshQueue();
    const timer = setInterval(() => void refreshQueue(), QUEUE_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshQueue]);

  const zipBusy = Boolean(exporting || zipStatus?.busy);
  const zipPollInterval = zipBusy ? ZIP_BUSY_POLL_INTERVAL_MS : ZIP_IDLE_POLL_INTERVAL_MS;
  useEffect(() => {
    void refreshZipStatus();
    const timer = setInterval(() => void refreshZipStatus(), zipPollInterval);
    return () => clearInterval(timer);
  }, [refreshZipStatus, zipPollInterval]);

  const counts = useMemo(() => countQueueJobs(jobs), [jobs]);
  const activeJobs = counts.processing + counts.queued;
  const translatedPages = zipStatus?.total ?? 0;
  const queueProgress = counts.processing + counts.queued + counts.done > 0
    ? Math.round((counts.done / (counts.processing + counts.queued + counts.done)) * 100)
    : 0;

  /** @returns Nothing; opens the distraction-free reader and dismisses the popup. */
  const handleOpenReader = async (): Promise<void> => {
    await sendToActiveTopFrame('OPEN_CHAPTER_READER');
    window.close();
  };

  /** @returns Nothing; starts a chapter ZIP export and mirrors its live status. */
  const handleExport = async (): Promise<void> => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      const status = await sendToActiveTopFrame<ChapterZipStatus>('EXPORT_CHAPTER_ZIP');
      if (mountedRef.current && status) setZipStatus(status);
    } finally {
      exportingRef.current = false;
      if (mountedRef.current) {
        setExporting(false);
        void refreshZipStatus();
      }
    }
  };

  if (activeJobs === 0 && translatedPages === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {activeJobs > 0 ? (
        <button
          type="button"
          onClick={onOpenBatch}
          title="Open the Batch queue"
          className="min-h-[44px] w-full rounded-lg border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-vellum)] px-3 py-2 text-left transition-colors hover:border-[var(--color-editorial)] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--color-ink)]">
              {`Processing ${counts.processing} · Queued ${counts.queued} · Done ${counts.done}`}
            </span>
            <ChevronRight size={14} className="shrink-0 text-[var(--color-muted)]" />
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-paper)]">
            <div
              className="h-full rounded-full bg-[var(--color-editorial)] transition-[width] duration-300"
              style={{ width: `${queueProgress}%` }}
            />
          </div>
        </button>
      ) : null}

      {translatedPages > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleOpenReader}
            title="Open the distraction-free chapter reader"
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-vellum)] px-2 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] cursor-pointer"
          >
            <BookOpen size={14} className="shrink-0 text-[var(--color-editorial)]" />
            <span className="truncate">{`Reader (${translatedPages})`}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={zipBusy}
            title="Download all translated pages as a ZIP archive"
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-[var(--color-dust)] border-opacity-30 bg-[var(--color-vellum)] px-2 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-editorial)] hover:text-[var(--color-editorial)] disabled:cursor-wait disabled:opacity-60 cursor-pointer"
          >
            {zipBusy ? (
              <Loader size={14} className="shrink-0 animate-spin text-[var(--color-editorial)]" />
            ) : (
              <Archive size={14} className="shrink-0 text-[var(--color-editorial)]" />
            )}
            <span className="truncate">
              {zipBusy
                ? `Exporting${zipStatus && zipStatus.percent > 0 ? ` ${zipStatus.percent}%` : '…'}`
                : 'ZIP'}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
