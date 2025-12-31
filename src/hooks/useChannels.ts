/**
 * useChannels hook
 *
 * Fetches and caches channel data for a space
 */

import { useQuery } from '@tanstack/react-query';
import type { Channel } from '../types';
import type { StorageAdapter } from '../storage';
import { queryKeys } from './keys';

export interface UseChannelsOptions {
  storage: StorageAdapter;
  spaceId: string | undefined;
  enabled?: boolean;
}

export function useChannels({ storage, spaceId, enabled = true }: UseChannelsOptions) {
  return useQuery({
    queryKey: queryKeys.channels.bySpace(spaceId ?? ''),
    queryFn: async (): Promise<Channel[]> => {
      if (!spaceId) return [];
      return storage.getChannels(spaceId);
    },
    enabled: enabled && !!spaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Helper to extract channels from a space's groups
 */
export function flattenChannels(groups: { channels: Channel[] }[]): Channel[] {
  return groups.flatMap((group) => group.channels);
}

/**
 * Find a channel by ID within groups
 */
export function findChannel(
  groups: { channels: Channel[] }[],
  channelId: string
): Channel | undefined {
  for (const group of groups) {
    const channel = group.channels.find((c) => c.channelId === channelId);
    if (channel) return channel;
  }
  return undefined;
}
