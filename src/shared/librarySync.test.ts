import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSyncId, SYNC_DRIVE_APPDATA_SCOPE } from './librarySync';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('library sync seam', () => {
  it('uses the narrow Drive app-data scope', () => {
    expect(SYNC_DRIVE_APPDATA_SCOPE).toBe('https://www.googleapis.com/auth/drive.appdata');
  });

  it('creates unique UUID-v4 sync identifiers', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createSyncId()));

    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(UUID_V4_PATTERN);
  });

  it('still returns UUID-shaped identifiers without Web Crypto', () => {
    vi.stubGlobal('crypto', {});

    const first = createSyncId();
    const second = createSyncId();

    expect(first).toMatch(UUID_V4_PATTERN);
    expect(second).toMatch(UUID_V4_PATTERN);
    expect(first).not.toBe(second);
  });
});
