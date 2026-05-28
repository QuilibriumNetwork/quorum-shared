/**
 * useViewerOverlay — fills `viewerLiked` / `viewerRecasted` flags on
 * normalized casts when the user has a legacy bearer token. Hypersnap
 * reads are unauth and don't carry viewer context, so we lazily layer
 * the bearer's perspective on top.
 *
 * The resolver is pluggable so the host can implement it against the
 * legacy reactions endpoint (or any future authed source). It receives
 * the cast hashes that need overlay data and returns a per-hash map.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { withViewerOverlay } from '../normalize';
import type { NormalizedCast } from '../types';

export interface ViewerOverlayEntry {
  viewerLiked?: boolean;
  viewerRecasted?: boolean;
}

export type ViewerOverlayResolver = (
  castHashes: string[],
  token: string,
) => Promise<Record<string, ViewerOverlayEntry>>;

export interface UseViewerOverlayOptions {
  casts: NormalizedCast[];
  token?: string;
  resolver: ViewerOverlayResolver;
  /** Disable the overlay (e.g. user opted out of legacy auth). */
  enabled?: boolean;
}

const STALE_TIME_MS = 60_000;

export function useViewerOverlay({
  casts,
  token,
  resolver,
  enabled = true,
}: UseViewerOverlayOptions): NormalizedCast[] {
  const hashes = useMemo(() => {
    if (!enabled || !token) return [] as string[];
    const need = casts
      .filter((c) => c.reactions.viewerLiked === undefined || c.reactions.viewerRecasted === undefined)
      .map((c) => c.hash);
    return Array.from(new Set(need));
  }, [casts, enabled, token]);

  const query = useQuery<Record<string, ViewerOverlayEntry>, Error>({
    queryKey: ['farcaster', 'viewer-overlay', { hashes: [...hashes].sort(), token: token ? 'set' : 'unset' }],
    queryFn: () => resolver(hashes, token as string),
    enabled: enabled && Boolean(token) && hashes.length > 0,
    staleTime: STALE_TIME_MS,
  });

  return useMemo(() => {
    if (!query.data) return casts;
    return casts.map((cast) => {
      const overlay = query.data?.[cast.hash];
      return overlay ? withViewerOverlay(cast, overlay) : cast;
    });
  }, [casts, query.data]);
}
