/**
 * useFarcasterUserByUsername — username lookup with hypersnap → legacy fallback.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import { fromHypersnapUser, fromLegacyUser } from '../normalize';
import type { NormalizedUser } from '../types';
import { farcasterQueryKeys } from './queryKeys';

const STALE_TIME_MS = 5 * 60_000;

export interface UseFarcasterUserByUsernameOptions {
  token?: string;
  enabled?: boolean;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  staleTime?: number;
}

export async function fetchFarcasterUserByUsername(
  username: string,
  opts: { token?: string; hypersnap?: HypersnapClient; legacy?: LegacyFarcasterClient } = {},
): Promise<NormalizedUser | null> {
  const hyp = opts.hypersnap ?? getDefaultHypersnapClient();
  try {
    const u = await hyp.getUserByUsername(username);
    return fromHypersnapUser(u);
  } catch {
    // fall through
  }
  const legacy = opts.legacy ?? getDefaultLegacyClient();
  try {
    const u = await legacy.getUserByUsername(username, opts.token);
    return u ? fromLegacyUser(u) : null;
  } catch {
    return null;
  }
}

export function useFarcasterUserByUsername(
  username: string | undefined,
  options: UseFarcasterUserByUsernameOptions = {},
) {
  const enabled = (options.enabled ?? true) && Boolean(username);

  return useQuery({
    queryKey: farcasterQueryKeys.userByUsername(username),
    queryFn: () => fetchFarcasterUserByUsername(username as string, options),
    enabled,
    staleTime: options.staleTime ?? STALE_TIME_MS,
  } satisfies UseQueryOptions<NormalizedUser | null, Error>);
}
