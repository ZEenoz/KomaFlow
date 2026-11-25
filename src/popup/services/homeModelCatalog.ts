import { useEffect, useMemo, useState } from 'react';
import type { PopupState } from '../../shared/types';
import { BUBBLE_YOLO_MODEL_ID } from '../../shared/bubbleModes';
import { COLOR_TIER_CATALOG } from '../../shared/colorTiers';
import { INPAINT_TIER_CATALOG } from '../../shared/inpaintTiers';
import { OCR_TIER_CATALOG } from '../../shared/ocrTiers';
import { ModelRegistry } from './ModelRegistry';

/** Canonical translate-engine id for Google's free endpoint. */
export const GOOGLE_ENGINE_ID = 'gg-translate';
/** Canonical translate-engine id for the signed-in shared pool. */
export const CLOUD_ENGINE_ID = 'cloudflare-translate';
/** Daily shared-pool allowance shown beside the live remaining count. */
export const CLOUD_DAILY_QUOTA_LIMIT = 100;
export { BUBBLE_YOLO_MODEL_ID } from '../../shared/bubbleModes';

/** Downloadable non-translation models a Home preset can select. */
const FIXED_HOME_MODEL_IDS: readonly string[] = [
  ...INPAINT_TIER_CATALOG.filter((tier) => tier.isModel).map((tier) => tier.id),
  ...COLOR_TIER_CATALOG.filter((tier) => tier.isModel).map((tier) => tier.id),
  ...OCR_TIER_CATALOG.map((tier) => tier.id),
  BUBBLE_YOLO_MODEL_ID,
];

/** One translate engine offered by the Home active-stack controls. */
export interface HomeEngineOption {
  /** Engine id persisted in popup state. */
  id: string;
  /** User-facing engine name. */
  name: string;
  /** Engine family used to decide whether a download is required. */
  kind: 'builtin' | 'cloud' | 'custom' | 'local';
  /** Whether the engine can run without a pending model download. */
  isDownloaded: boolean;
}

/** Result shape of the background/offscreen model-status RPC. */
interface ModelStatusResponse {
  status?: string;
  statuses?: Record<string, boolean>;
}

/** Engine and model availability shared by the Home cards and preset editor. */
export interface HomeModelCatalog {
  /** Every selectable translation engine, including not-yet-downloaded local models. */
  engines: HomeEngineOption[];
  /** Cache status keyed by model id. */
  statuses: Record<string, boolean>;
  /** True once the initial status response (or failure) has settled. */
  statusesLoaded: boolean;
}

/**
 * Formats the shared-pool allowance for a compact quota badge.
 *
 * @param quotaRemaining - Live remaining translations supplied by the account.
 * @returns Text such as `84/100`.
 */
export function formatCloudQuota(quotaRemaining?: number): string {
  return `${quotaRemaining ?? CLOUD_DAILY_QUOTA_LIMIT}/${CLOUD_DAILY_QUOTA_LIMIT}`;
}

/**
 * Resolves model cache statuses through the background/offscreen route.
 *
 * @param modelIds - Model identifiers to inspect.
 * @returns Downloaded-state flags, or `null` when the query fails so callers avoid false missing alerts.
 */
async function fetchModelStatuses(modelIds: readonly string[]): Promise<Record<string, boolean> | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'GET_MODEL_STATUSES',
          target: 'background',
          source: 'popup',
          request: true,
          payload: { modelIds },
        },
        (response: ModelStatusResponse | undefined) => {
          if (chrome.runtime.lastError || response?.status !== 'success') {
            resolve(null);
            return;
          }
          resolve(response.statuses ?? {});
        },
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Loads the translation-engine catalog and the model statuses a Home preset can select.
 *
 * @param state - Live popup state, including account and custom API configuration.
 * @returns Engine options, model statuses, and whether the first status load has settled.
 */
export function useHomeModelCatalog(state: PopupState): HomeModelCatalog {
  const [localEngines, setLocalEngines] = useState<HomeEngineOption[]>([]);
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const available = await ModelRegistry.getAvailableEngines();
        if (cancelled) return;
        const local = available
          .filter((engine) => engine.type === 'local')
          .map((engine) => ({
            id: engine.id,
            name: engine.name,
            kind: 'local' as const,
            isDownloaded: false,
          }));
        setLocalEngines(local);
        const nextStatuses = await fetchModelStatuses([
          ...local.map((engine) => engine.id),
          ...FIXED_HOME_MODEL_IDS,
        ]);
        if (!cancelled && nextStatuses !== null) {
          setStatuses(nextStatuses);
          setStatusesLoaded(true);
        }
      } catch (error) {
        console.warn('[Home] Failed to load model availability:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const engines = useMemo<HomeEngineOption[]>(() => {
    const readyDefaults: HomeEngineOption[] = [
      {
        id: GOOGLE_ENGINE_ID,
        name: 'Google Translate',
        kind: 'builtin',
        isDownloaded: true,
      },
    ];
    if (state.userAccount?.signedIn) {
      readyDefaults.push({
        id: CLOUD_ENGINE_ID,
        name: 'Cloud Shared Pool',
        kind: 'cloud',
        isDownloaded: true,
      });
    }
    const custom: HomeEngineOption[] = (state.customApis ?? []).map((api) => ({
      id: api.id,
      name: `${api.provider}/${api.modelName}`,
      kind: 'custom',
      isDownloaded: true,
    }));
    const local = localEngines.map((engine) => ({
      ...engine,
      isDownloaded: Boolean(statuses[engine.id]),
    }));
    return [...readyDefaults, ...custom, ...local];
  }, [state.userAccount?.signedIn, state.customApis, localEngines, statuses]);

  return { engines, statuses, statusesLoaded };
}
