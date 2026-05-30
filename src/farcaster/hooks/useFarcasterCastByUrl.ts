/**
 * useFarcasterCastByUrl — resolve a `https://farcaster.xyz/<username>/0x<prefix>`
 * URL to a full `NormalizedCast`. Used to render farcaster.xyz cast links as
 * inline quote-cast previews instead of bare "View cast" link cards.
 *
 * Hypersnap requires a full 40-char hash, which the URL form doesn't carry —
 * URLs use a 10-char prefix. We fall through to farcaster.xyz's legacy
 * `/user-thread-casts` endpoint, which DOES accept prefix+username, then
 * find the matching cast in the returned thread and normalize it.
 *
 * Cached aggressively (gcTime: Infinity by default) since cast content is
 * immutable.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { fromLegacyCast } from '../normalize';
import type { LegacyCast, NormalizedCast } from '../types';

const LEGACY_THREAD_URL = 'https://farcaster.xyz/~api/v2/user-thread-casts';

export interface UseFarcasterCastByUrlOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

interface LegacyThreadResponse {
  result?: { casts?: LegacyCast[] };
}

export async function fetchFarcasterCastByUrl(
  username: string,
  castHashPrefix: string,
): Promise<NormalizedCast | null> {
  if (!username || !castHashPrefix) return null;
  const url = `${LEGACY_THREAD_URL}?castHashPrefix=${encodeURIComponent(castHashPrefix)}&username=${encodeURIComponent(username)}&limit=10`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      origin: 'https://farcaster.xyz',
      referer: 'https://farcaster.xyz/',
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as LegacyThreadResponse;
  const casts = json.result?.casts ?? [];
  // /user-thread-casts returns the whole conversation, so the cast we asked
  // for may be at any position. Find by prefix-match against the supplied
  // castHashPrefix (case-insensitive).
  const prefix = castHashPrefix.toLowerCase();
  const match = casts.find((c) => c.hash?.toLowerCase().startsWith(prefix));
  if (!match) return null;
  return fromLegacyCast(match);
}

export function useFarcasterCastByUrl(
  username: string | undefined,
  castHashPrefix: string | undefined,
  options: UseFarcasterCastByUrlOptions = {},
) {
  const enabled =
    (options.enabled ?? true) && Boolean(username) && Boolean(castHashPrefix);

  return useQuery({
    queryKey: ['farcaster', 'cast-by-url', { username, castHashPrefix }] as const,
    queryFn: () => fetchFarcasterCastByUrl(username as string, castHashPrefix as string),
    enabled,
    staleTime: options.staleTime ?? Infinity,
    gcTime: options.gcTime ?? Infinity,
  } satisfies UseQueryOptions<NormalizedCast | null, Error>);
}
