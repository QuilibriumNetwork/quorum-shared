/**
 * useHomeFeed — paginated following feed with hypersnap → legacy fallback.
 *
 * Each page is fetched from one source; if hypersnap fails on page N we
 * switch to legacy for that page and continue paginating from legacy.
 * Cursors are not interchangeable between sources, so we track per-page
 * `source` and the cursor shape that source uses.
 */

import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import { fromHypersnapCast, fromLegacyFeedItem } from '../normalize';
import type { FarcasterSource, NormalizedCast } from '../types';
import { farcasterQueryKeys } from './queryKeys';

const STALE_TIME_MS = 2 * 60_000;
const PAGE_LIMIT = 25;

export interface HomeFeedPage {
  casts: NormalizedCast[];
  source: FarcasterSource;
  nextCursor: HomeFeedCursor | null;
  /** Set of exclude prefixes accumulated for the legacy fetcher. */
  excludeItemIdPrefixes: string[];
}

export type HomeFeedCursor =
  | { source: 'hypersnap'; cursor: string }
  | {
      source: 'legacy';
      olderThan: number;
      latestMainCastTimestamp?: number;
      excludeItemIdPrefixes: string[];
    };

export interface UseHomeFeedOptions {
  /** Viewing user's FID — required for the following feed. */
  fid: number | undefined;
  /** Bearer token for the legacy fallback. */
  token?: string;
  /** Disable the query (e.g. when prerequisites are not yet loaded). */
  enabled?: boolean;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  /** Optional scam filter applied at the fetch boundary so cursors and
   *  exclude lists stay coherent. Return true to keep the cast. */
  filterCast?: (cast: NormalizedCast) => boolean;
  staleTime?: number;
}

async function fetchHypersnapPage(
  fid: number,
  cursor: string | undefined,
  hypersnap: HypersnapClient,
): Promise<HomeFeedPage> {
  const res = await hypersnap.getFollowingFeed(fid, { cursor, limit: PAGE_LIMIT });
  const casts = res.casts.map(fromHypersnapCast);
  const nextCursor = res.next.cursor;
  return {
    casts,
    source: 'hypersnap',
    nextCursor: nextCursor ? { source: 'hypersnap', cursor: nextCursor } : null,
    excludeItemIdPrefixes: [],
  };
}

async function fetchLegacyPage(
  cursor: Extract<HomeFeedCursor, { source: 'legacy' }> | undefined,
  legacy: LegacyFarcasterClient,
  token: string,
  carriedExcludes: string[],
): Promise<HomeFeedPage> {
  const res = await legacy.getFeedItems(
    {
      feedKey: 'home',
      olderThan: cursor?.olderThan,
      latestMainCastTimestamp: cursor?.latestMainCastTimestamp,
      excludeItemIdPrefixes: cursor?.excludeItemIdPrefixes ?? carriedExcludes,
    },
    token,
  );
  const casts = res.items.map(fromLegacyFeedItem);
  // Cursor: prefer latestMainCastTimestamp; fall back to the last item.
  const last = res.items[res.items.length - 1];
  const nextOlderThan = res.latestMainCastTimestamp ?? last?.timestamp ?? null;
  // Item-id prefix dedup mirrors the legacy semantics.
  const newPrefixes = res.items.map((item) => item.id.slice(2, 10));
  const accumulated = [...(cursor?.excludeItemIdPrefixes ?? carriedExcludes), ...newPrefixes];
  return {
    casts,
    source: 'legacy',
    nextCursor: nextOlderThan
      ? {
          source: 'legacy',
          olderThan: nextOlderThan,
          latestMainCastTimestamp: res.latestMainCastTimestamp,
          excludeItemIdPrefixes: accumulated,
        }
      : null,
    excludeItemIdPrefixes: accumulated,
  };
}

export function useHomeFeed(options: UseHomeFeedOptions) {
  const fid = options.fid;
  const enabled = (options.enabled ?? true) && Number.isFinite(fid) && (fid as number) > 0;

  return useInfiniteQuery<
    HomeFeedPage,
    Error,
    InfiniteData<HomeFeedPage>,
    readonly unknown[],
    HomeFeedCursor | undefined
  >({
    queryKey: farcasterQueryKeys.homeFeed(fid),
    initialPageParam: undefined,
    enabled,
    staleTime: options.staleTime ?? STALE_TIME_MS,
    queryFn: async ({ pageParam }) => {
      const hypersnap = options.hypersnap ?? getDefaultHypersnapClient();
      const legacy = options.legacy ?? getDefaultLegacyClient();
      const cursor = pageParam;

      // Try hypersnap unless the cursor pins us to legacy.
      if (!cursor || cursor.source === 'hypersnap') {
        try {
          const page = await fetchHypersnapPage(fid as number, cursor?.cursor, hypersnap);
          return applyFilter(page, options.filterCast);
        } catch {
          // fall through
        }
      }

      if (!options.token) {
        // No token, no legacy fallback possible — return empty terminator.
        return { casts: [], source: 'legacy', nextCursor: null, excludeItemIdPrefixes: [] };
      }
      const legacyCursor = cursor?.source === 'legacy' ? cursor : undefined;
      const page = await fetchLegacyPage(legacyCursor, legacy, options.token, []);
      return applyFilter(page, options.filterCast);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

function applyFilter(page: HomeFeedPage, filterCast?: (c: NormalizedCast) => boolean): HomeFeedPage {
  if (!filterCast) return page;
  return { ...page, casts: page.casts.filter(filterCast) };
}

/** Convenience flattener for callers that want a single cast list. */
export function flattenHomeFeed(data: InfiniteData<HomeFeedPage> | undefined): NormalizedCast[] {
  if (!data) return [];
  return data.pages.flatMap((p) => p.casts);
}
