/**
 * useFarcasterUser — read a user by FID, preferring hypersnap with legacy
 * fallback.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import { fromHypersnapUser, fromLegacyUser } from '../normalize';
import type { NormalizedUser } from '../types';
import { farcasterQueryKeys } from './queryKeys';

const STALE_TIME_MS = 5 * 60_000;

export interface UseFarcasterUserOptions {
  /** Optional Farcaster bearer token, forwarded to the legacy fallback so it
   *  can include `viewerContext`. Hypersnap reads ignore this. */
  token?: string;
  /** Disable the query (e.g. when FID isn't known yet). */
  enabled?: boolean;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  /** Override the React Query stale time. */
  staleTime?: number;
}

/** Imperative fetcher used by mutations / overlay hooks. */
export async function fetchFarcasterUser(
  fid: number,
  opts: { token?: string; hypersnap?: HypersnapClient; legacy?: LegacyFarcasterClient } = {},
): Promise<NormalizedUser | null> {
  const hyp = opts.hypersnap ?? getDefaultHypersnapClient();
  try {
    const u = await hyp.getUserByFid(fid);
    return fromHypersnapUser(u);
  } catch {
    // fall through
  }
  const legacy = opts.legacy ?? getDefaultLegacyClient();
  try {
    const u = await legacy.getUserByFid(fid, opts.token);
    return u ? fromLegacyUser(u) : null;
  } catch {
    return null;
  }
}

export function useFarcasterUser(
  fid: number | undefined,
  options: UseFarcasterUserOptions = {},
) {
  const enabled = (options.enabled ?? true) && Number.isFinite(fid) && (fid as number) > 0;

  return useQuery({
    queryKey: farcasterQueryKeys.user(fid),
    queryFn: () => fetchFarcasterUser(fid as number, options),
    enabled,
    staleTime: options.staleTime ?? STALE_TIME_MS,
  } satisfies UseQueryOptions<NormalizedUser | null, Error>);
}
