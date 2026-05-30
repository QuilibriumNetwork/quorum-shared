/**
 * useFarcasterChannelByParentUrl — resolve a `parent_url` value to channel
 * metadata. Channels are indexed by an opaque URI (e.g. the legacy
 * `https://warpcast.com/~/channel/base` form, or newer Zora/Optimism
 * `chain://eip155:7777777/erc721:0x…` URIs). Hypersnap's
 * `/v2/farcaster/channel?id=<url>&type=parent_url` returns the canonical
 * record when it has one.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';

export interface FarcasterChannelInfo {
  key: string;
  name: string;
  parentUrl: string;
  imageUrl?: string;
  description?: string;
  memberCount?: number;
}

const STALE_TIME_MS = 24 * 60 * 60_000; // 24 h — channel metadata changes rarely

export interface UseFarcasterChannelByParentUrlOptions {
  enabled?: boolean;
  hypersnap?: HypersnapClient;
  staleTime?: number;
  gcTime?: number;
  initialData?: FarcasterChannelInfo | null;
}

export async function fetchChannelByParentUrl(
  parentUrl: string,
  opts: { hypersnap?: HypersnapClient } = {},
): Promise<FarcasterChannelInfo | null> {
  const hyp = opts.hypersnap ?? getDefaultHypersnapClient();
  const channel = await hyp.getChannelByParentUrl(parentUrl);
  if (!channel) return null;
  return {
    key: channel.id,
    name: channel.name,
    parentUrl: channel.parent_url ?? parentUrl,
    imageUrl: channel.image_url,
    description: channel.description,
    memberCount: channel.member_count,
  };
}

export function useFarcasterChannelByParentUrl(
  parentUrl: string | undefined,
  options: UseFarcasterChannelByParentUrlOptions = {},
) {
  const enabled = (options.enabled ?? true) && Boolean(parentUrl);

  return useQuery({
    queryKey: ['farcaster', 'channel-by-parent-url', { parentUrl }] as const,
    queryFn: () => fetchChannelByParentUrl(parentUrl as string, options),
    enabled,
    staleTime: options.staleTime ?? STALE_TIME_MS,
    gcTime: options.gcTime,
    initialData: options.initialData ?? undefined,
  } satisfies UseQueryOptions<FarcasterChannelInfo | null, Error>);
}
