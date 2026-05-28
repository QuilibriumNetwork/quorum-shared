/**
 * useChannelFeed — paginated channel feed with hypersnap → legacy fallback.
 *
 * Hypersnap channel feed coverage is currently sparse; the hook still tries
 * hypersnap first so the migration takes effect automatically as backfill
 * completes, but falls back to legacy when hypersnap returns an empty page
 * or fails outright.
 */

import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import { fromHypersnapCast, fromLegacyFeedItem } from '../normalize';
import type { FarcasterSource, NormalizedCast } from '../types';
import { farcasterQueryKeys } from './queryKeys';

const STALE_TIME_MS = 2 * 60_000;
const PAGE_LIMIT = 25;

export interface ChannelFeedPage {
  casts: NormalizedCast[];
  source: FarcasterSource;
  nextCursor: ChannelFeedCursor | null;
}

export type ChannelFeedCursor =
  | { source: 'hypersnap'; cursor: string }
  | {
      source: 'legacy';
      olderThan: number;
      latestMainCastTimestamp?: number;
      excludeItemIdPrefixes: string[];
    };

export interface UseChannelFeedOptions {
  channelKey: string | undefined;
  token?: string;
  enabled?: boolean;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  filterCast?: (cast: NormalizedCast) => boolean;
  staleTime?: number;
}

export function useChannelFeed(options: UseChannelFeedOptions) {
  const channelKey = options.channelKey;
  const enabled = (options.enabled ?? true) && Boolean(channelKey);

  return useInfiniteQuery<
    ChannelFeedPage,
    Error,
    InfiniteData<ChannelFeedPage>,
    readonly unknown[],
    ChannelFeedCursor | undefined
  >({
    queryKey: farcasterQueryKeys.channelFeed(channelKey ?? ''),
    initialPageParam: undefined,
    enabled,
    staleTime: options.staleTime ?? STALE_TIME_MS,
    queryFn: async ({ pageParam }) => {
      const hypersnap = options.hypersnap ?? getDefaultHypersnapClient();
      const legacy = options.legacy ?? getDefaultLegacyClient();

      if (!pageParam || pageParam.source === 'hypersnap') {
        try {
          const res = await hypersnap.getChannelFeed([channelKey as string], {
            cursor: pageParam?.cursor,
            limit: PAGE_LIMIT,
          });
          if (res.casts.length > 0) {
            const casts = res.casts.map(fromHypersnapCast);
            return finalize(
              {
                casts,
                source: 'hypersnap',
                nextCursor: res.next.cursor
                  ? { source: 'hypersnap', cursor: res.next.cursor }
                  : null,
              },
              options.filterCast,
            );
          }
          // Empty hypersnap page → fall through to legacy so the user
          // still sees content while backfill is incomplete.
        } catch {
          // fall through
        }
      }

      if (!options.token) {
        return { casts: [], source: 'legacy', nextCursor: null };
      }
      const legacyCursor = pageParam?.source === 'legacy' ? pageParam : undefined;
      const res = await legacy.getFeedItems(
        {
          feedKey: channelKey as string,
          olderThan: legacyCursor?.olderThan,
          latestMainCastTimestamp: legacyCursor?.latestMainCastTimestamp,
          excludeItemIdPrefixes: legacyCursor?.excludeItemIdPrefixes ?? [],
        },
        options.token,
      );
      const casts = res.items.map(fromLegacyFeedItem);
      const last = res.items[res.items.length - 1];
      const nextOlderThan = res.latestMainCastTimestamp ?? last?.timestamp ?? null;
      const newPrefixes = res.items.map((item) => item.id.slice(2, 10));
      const accumulated = [...(legacyCursor?.excludeItemIdPrefixes ?? []), ...newPrefixes];
      return finalize(
        {
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
        },
        options.filterCast,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

function finalize(
  page: ChannelFeedPage,
  filterCast?: (c: NormalizedCast) => boolean,
): ChannelFeedPage {
  if (!filterCast) return page;
  return { ...page, casts: page.casts.filter(filterCast) };
}

export function flattenChannelFeed(data: InfiniteData<ChannelFeedPage> | undefined): NormalizedCast[] {
  if (!data) return [];
  return data.pages.flatMap((p) => p.casts);
}
