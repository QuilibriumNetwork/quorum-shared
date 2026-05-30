/**
 * useFarcasterCast — read a single normalized cast by hash. Hypersnap
 * requires the author FID plus full hash; legacy can resolve by hash+
 * username when needed. We use the hypersnap path when both are known.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { fromHypersnapCast } from '../normalize';
import type { NormalizedCast } from '../types';

const STALE_TIME_MS = 10 * 60_000;

export interface UseFarcasterCastOptions {
  enabled?: boolean;
  hypersnap?: HypersnapClient;
  staleTime?: number;
  gcTime?: number;
  initialData?: NormalizedCast | null;
}

export async function fetchFarcasterCast(
  hash: string,
  authorFid: number,
  opts: { hypersnap?: HypersnapClient } = {},
): Promise<NormalizedCast | null> {
  const hyp = opts.hypersnap ?? getDefaultHypersnapClient();
  try {
    const c = await hyp.getCastByHash(authorFid, hash);
    return fromHypersnapCast(c);
  } catch {
    return null;
  }
}

export function useFarcasterCast(
  hash: string | undefined,
  authorFid: number | undefined,
  options: UseFarcasterCastOptions = {},
) {
  const enabled =
    (options.enabled ?? true) &&
    Boolean(hash) &&
    Number.isFinite(authorFid) &&
    (authorFid as number) > 0;

  return useQuery({
    queryKey: ['farcaster', 'cast', { hash, fid: authorFid }] as const,
    queryFn: () => fetchFarcasterCast(hash as string, authorFid as number, options),
    enabled,
    staleTime: options.staleTime ?? STALE_TIME_MS,
    gcTime: options.gcTime,
    initialData: options.initialData ?? undefined,
  } satisfies UseQueryOptions<NormalizedCast | null, Error>);
}
