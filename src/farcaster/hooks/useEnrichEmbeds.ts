/**
 * useEnrichEmbeds — background OG / image / video / frame enrichment for
 * embed URLs returned bare from hypersnap. Each unique URL is cached
 * independently in React Query so multiple casts that share an embed only
 * pay one fetch.
 *
 * The enrichment endpoint isn't part of the public Farcaster API surface;
 * we expose a pluggable resolver so the host app can wire in whatever
 * preview / scraper it already uses. Mobile injects an OpenGraph fetcher
 * (or reuses the embed-cards endpoint farcaster.xyz exposes).
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { withEmbedEnrichment } from '../normalize';
import type { NormalizedCast, NormalizedEmbed } from '../types';
import { farcasterQueryKeys } from './queryKeys';

const STALE_TIME_MS = 30 * 60_000;
const MAX_ENRICH_PER_BATCH = 8;

export type EmbedEnrichmentResolver = (url: string) => Promise<Partial<NormalizedEmbed> | null>;

export interface UseEnrichEmbedsOptions {
  casts: NormalizedCast[];
  resolver: EmbedEnrichmentResolver;
  /** Disable enrichment (e.g. cellular connection). */
  enabled?: boolean;
}

interface EnrichedEntry {
  url: string;
  enrichment: Partial<NormalizedEmbed> | null;
}

/**
 * Returns the same cast list, with embeds enriched in-place once their
 * resolver completes. Stable identity for casts whose embeds haven't
 * changed since the last render.
 */
export function useEnrichEmbeds({
  casts,
  resolver,
  enabled = true,
}: UseEnrichEmbedsOptions): NormalizedCast[] {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);

  // Collect bare URLs that lack OG metadata so we can issue background fetches.
  const targetUrls = useMemo(() => {
    if (!enabled) return [] as string[];
    const seen = new Set<string>();
    for (const cast of casts) {
      for (const embed of cast.embeds) {
        if (!embed.url) continue;
        if (embed.openGraph || embed.image || embed.video || embed.frame) continue;
        if (!seen.has(embed.url)) seen.add(embed.url);
      }
    }
    return Array.from(seen).slice(0, MAX_ENRICH_PER_BATCH);
  }, [casts, enabled]);

  useEffect(() => {
    if (!enabled || targetUrls.length === 0) return;
    let cancelled = false;
    Promise.allSettled(
      targetUrls.map(async (url): Promise<EnrichedEntry> => {
        const key = farcasterQueryKeys.embedEnrichment(url);
        const existing = queryClient.getQueryData<Partial<NormalizedEmbed> | null>(key);
        if (existing !== undefined) return { url, enrichment: existing };
        try {
          const enrichment = await queryClient.fetchQuery({
            queryKey: key,
            queryFn: () => resolver(url),
            staleTime: STALE_TIME_MS,
          });
          return { url, enrichment };
        } catch {
          return { url, enrichment: null };
        }
      }),
    ).then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => { cancelled = true; };
    // tick intentionally omitted — we drive it from the effect itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUrls.join('|'), enabled]);

  // Merge whatever the cache currently holds onto each cast.
  return useMemo(() => {
    if (casts.length === 0) return casts;
    return casts.map((cast) => {
      let next = cast;
      for (const embed of cast.embeds) {
        if (!embed.url) continue;
        const enriched = queryClient.getQueryData<Partial<NormalizedEmbed> | null>(
          farcasterQueryKeys.embedEnrichment(embed.url),
        );
        if (enriched) {
          next = withEmbedEnrichment(next, { ...enriched, url: embed.url });
        }
      }
      return next;
    });
    // tick forces re-evaluation when a fetch completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casts, tick]);
}
