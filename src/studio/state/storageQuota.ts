/** Bytes per megabyte used for human-readable quota math. */
const BYTES_PER_MB = 1024 * 1024;

/** High storage usage percentage threshold triggering warning indicators. */
export const HIGH_STORAGE_WARNING_THRESHOLD_PERCENT = 80;

/** Browser-estimated disk usage and quota for the extension origin. */
export interface StorageQuotaInfo {
  /** Whether the origin currently holds persistent storage. */
  persisted: boolean;
  /** Estimated bytes in use. */
  usedBytes: number;
  /** Estimated quota in bytes. */
  quotaBytes: number;
  /** Rounded used megabytes. */
  usedMB: number;
  /** Rounded quota megabytes. */
  quotaMB: number;
  /** Integer percentage of quota used, capped at 100. */
  usagePercent: number;
}

/**
 * Queries current browser disk usage and quota estimates.
 *
 * @returns Standardized usage statistics in bytes, megabytes, and percentage.
 */
export async function getStorageQuota(): Promise<StorageQuotaInfo> {
  let persisted = false;
  let usage = 0;
  let quota = 0;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      persisted = (await navigator.storage.persisted?.()) ?? false;
      const estimate = await navigator.storage.estimate?.();
      usage = estimate?.usage || 0;
      quota = estimate?.quota || 0;
    } catch (err) {
      console.warn('[ProjectStore] Failed to query storage estimate:', err);
    }
  }

  const usedMB = Math.round(usage / BYTES_PER_MB);
  const quotaMB = Math.round(quota / BYTES_PER_MB);
  const usagePercent = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0;

  return {
    persisted,
    usedBytes: usage,
    quotaBytes: quota,
    usedMB,
    quotaMB,
    usagePercent,
  };
}

/**
 * Requests persistent storage from the browser to safeguard manga projects from eviction.
 *
 * @returns True if the browser granted persistent storage.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch (err) {
      console.warn('[ProjectStore] Failed to request persistent storage:', err);
    }
  }
  return false;
}
