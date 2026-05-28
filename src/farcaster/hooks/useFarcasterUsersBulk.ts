/**
 * useFarcasterUsersBulk — batch-fetch normalized users by FID array, preferring
 * the hypersnap bulk endpoint and degrading to per-FID legacy lookups if the
 * bulk call fails.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import { fromHypersnapUser, fromLegacyUser } from '../normalize';
import type { NormalizedUser } from '../types';
import { farcasterQueryKeys } from './queryKeys';

const STALE_TIME_MS = 5 * 60_000;
const LEGACY_PARALLEL_FETCH = 8;

export interface UseFarcasterUsersBulkOptions {
  token?: string;
  enabled?: boolean;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  staleTime?: number;
}

async function fetchInLegacyChunks(
  fids: number[],
  legacy: LegacyFarcasterClient,
  token?: string,
): Promise<NormalizedUser[]> {
  const out: NormalizedUser[] = [];
  for (let i = 0; i < fids.length; i += LEGACY_PARALLEL_FETCH) {
    const slice = fids.slice(i, i + LEGACY_PARALLEL_FETCH);
    const settled = await Promise.allSettled(
      slice.map((fid) => legacy.getUserByFid(fid, token)),
    );
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        out.push(fromLegacyUser(result.value));
      }
    }
  }
  return out;
}

export async function fetchFarcasterUsersBulk(
  fids: number[],
  opts: { token?: string; hypersnap?: HypersnapClient; legacy?: LegacyFarcasterClient } = {},
): Promise<NormalizedUser[]> {
  if (fids.length === 0) return [];
  const unique = Array.from(new Set(fids)).filter((f) => Number.isFinite(f) && f > 0);

  const hyp = opts.hypersnap ?? getDefaultHypersnapClient();
  try {
    const users = await hyp.getUsersBulk(unique);
    if (users.length === unique.length) {
      return users.map(fromHypersnapUser);
    }
    // Partial coverage: take what we got, fall back for the rest.
    const got = new Set(users.map((u) => u.fid));
    const missing = unique.filter((f) => !got.has(f));
    const legacy = opts.legacy ?? getDefaultLegacyClient();
    const legacyUsers = await fetchInLegacyChunks(missing, legacy, opts.token);
    return [...users.map(fromHypersnapUser), ...legacyUsers];
  } catch {
    // Full fallback path.
  }
  const legacy = opts.legacy ?? getDefaultLegacyClient();
  return fetchInLegacyChunks(unique, legacy, opts.token);
}

export function useFarcasterUsersBulk(
  fids: number[],
  options: UseFarcasterUsersBulkOptions = {},
) {
  const enabled = (options.enabled ?? true) && fids.length > 0;
  return useQuery({
    queryKey: farcasterQueryKeys.usersBulk(fids),
    queryFn: () => fetchFarcasterUsersBulk(fids, options),
    enabled,
    staleTime: options.staleTime ?? STALE_TIME_MS,
  } satisfies UseQueryOptions<NormalizedUser[], Error>);
}
