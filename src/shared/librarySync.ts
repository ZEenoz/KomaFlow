/**
 * OAuth scope that grants access only to this application's hidden Drive app-data folder.
 *
 * The narrow scope keeps library sync from requesting visibility into unrelated user files.
 */
export const SYNC_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Domain entity kinds that can be mirrored to a remote library and tombstoned on delete. */
export type SyncEntityKind = 'project' | 'job';

/**
 * Deletion marker kept after a synced entity disappears locally.
 *
 * A tombstone lets the next sync propagate a delete instead of re-uploading the entity.
 */
export interface SyncTombstone {
  /** Stable identifier shared by the local record and its remote counterpart. */
  syncId: string;
  /** Entity family the deleted record belonged to. */
  kind: SyncEntityKind;
  /** Epoch milliseconds at which the local record was deleted. */
  deletedAt: number;
}

/** Small manifest summary returned after a provider finishes a sync pass. */
export interface LibrarySyncManifestSummary {
  /** Monotonic manifest revision produced by the most recent successful sync. */
  revision: number;
  /** Epoch milliseconds of the most recent successful sync. */
  updatedAt: number;
  /** Number of project records represented by the manifest. */
  projectCount: number;
  /** Number of translation job records represented by the manifest. */
  jobCount: number;
  /** Number of pending deletion markers represented by the manifest. */
  tombstoneCount: number;
}

/**
 * Transport contract for a library sync backend.
 *
 * Implementations own authentication and remote I/O; callers only need connectivity state,
 * the last successful sync time, and a sync result for status display.
 */
export interface ISyncProvider {
  /** Stable provider identifier used for preferences and diagnostics. */
  readonly id: string;
  /** OAuth scope the provider requests from the user. */
  readonly scope: string;
  /** @returns True when the provider currently holds usable credentials. */
  isConnected(): Promise<boolean>;
  /** @returns Epoch milliseconds of the last successful sync, or null when never synced. */
  getLastSyncedAt(): Promise<number | null>;
  /** Runs one sync pass and resolves with the resulting manifest summary. */
  syncNow(): Promise<LibrarySyncManifestSummary>;
}

/** Number of random bytes in a UUID. */
const UUID_BYTE_LENGTH = 16;

/** RFC 4122 version nibble written into byte 6. */
const UUID_VERSION_4 = 0x40;

/** RFC 4122 variant bits written into byte 8. */
const UUID_VARIANT_RFC_4122 = 0x80;

/** Mask that clears the version nibble before it is replaced. */
const UUID_VERSION_MASK = 0x0f;

/** Mask that clears the variant bits before they are replaced. */
const UUID_VARIANT_MASK = 0x3f;

/** Byte value used to generate fallback entropy when the Web Crypto API is unavailable. */
const FNV_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a prime used to mix fallback entropy. */
const FNV_PRIME = 0x01000193;

/** Width of one hexadecimal byte when formatting a UUID. */
const HEX_BYTE_WIDTH = 2;

/** Number of hexadecimal characters in each UUID group. */
const UUID_GROUP_LENGTHS = [8, 4, 4, 4, 12] as const;

/** Monotonic component that keeps same-millisecond fallback IDs distinct. */
let fallbackSequence = 0;

/**
 * Formats raw bytes as a lowercase, hyphenated UUID string.
 *
 * @param bytes - Exactly sixteen bytes in UUID order.
 * @returns Canonical 8-4-4-4-12 UUID text.
 */
function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(HEX_BYTE_WIDTH, '0')).join('');
  const groups: string[] = [];
  let offset = 0;
  for (const length of UUID_GROUP_LENGTHS) {
    groups.push(hex.slice(offset, offset + length));
    offset += length;
  }
  return groups.join('-');
}

/**
 * Writes best-effort entropy when no Web Crypto implementation is available.
 *
 * Time, a monotonic counter, and Math.random are mixed so IDs stay unique even when the
 * environment is deterministic (for example a stripped-down test runner).
 *
 * @param bytes - Destination buffer to fill.
 */
function fillFallbackEntropy(bytes: Uint8Array): void {
  const seed = `${Date.now().toString(36)}:${fallbackSequence++}:${Math.random().toString(36)}`;
  let state = FNV_OFFSET_BASIS;
  for (let index = 0; index < bytes.length; index++) {
    for (let charIndex = 0; charIndex < seed.length; charIndex++) {
      state = Math.imul(state ^ seed.charCodeAt(charIndex), FNV_PRIME);
    }
    bytes[index] = state & 0xff;
  }
}

/**
 * Creates a stable-format identifier for a synced project or job.
 *
 * Uses `crypto.randomUUID()` when available. Older or restricted environments get a UUID-v4
 * shaped value backed by `crypto.getRandomValues()`, with a timestamp/counter fallback when even
 * that API is missing.
 *
 * @returns A canonical lowercase UUID string suitable for the `syncId` indexes.
 */
export function createSyncId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Some embedded contexts expose randomUUID but deny it; fall through to byte generation.
    }
  }

  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    fillFallbackEntropy(bytes);
  }

  bytes[6] = (bytes[6] & UUID_VERSION_MASK) | UUID_VERSION_4;
  bytes[8] = (bytes[8] & UUID_VARIANT_MASK) | UUID_VARIANT_RFC_4122;
  return formatUuid(bytes);
}
