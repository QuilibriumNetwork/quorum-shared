/**
 * useMessages hook
 *
 * Infinite query for paginated message loading
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '../types';
import type { StorageAdapter, GetMessagesResult } from '../storage';
import { queryKeys } from './keys';

export interface UseMessagesOptions {
  storage: StorageAdapter;
  spaceId: string | undefined;
  channelId: string | undefined;
  enabled?: boolean;
  limit?: number;
}

export function useMessages({
  storage,
  spaceId,
  channelId,
  enabled = true,
  limit = 50,
}: UseMessagesOptions) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages.infinite(spaceId ?? '', channelId ?? ''),
    queryFn: async ({ pageParam }): Promise<GetMessagesResult> => {
      if (!spaceId || !channelId) {
        return { messages: [], nextCursor: null, prevCursor: null };
      }
      return storage.getMessages({
        spaceId,
        channelId,
        cursor: pageParam as number | undefined,
        direction: 'backward',
        limit,
      });
    },
    getNextPageParam: (lastPage) => lastPage.prevCursor,
    getPreviousPageParam: (firstPage) => firstPage.nextCursor,
    initialPageParam: undefined as number | undefined,
    enabled: enabled && !!spaceId && !!channelId,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Flatten paginated messages into a single array
 */
export function flattenMessages(
  pages: GetMessagesResult[] | undefined
): Message[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.messages);
}

/**
 * Hook to invalidate message cache
 */
export function useInvalidateMessages() {
  const queryClient = useQueryClient();

  return {
    invalidateChannel: (spaceId: string, channelId: string) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.infinite(spaceId, channelId),
      });
    },
    invalidateSpace: (spaceId: string) => {
      queryClient.invalidateQueries({
        queryKey: ['messages', 'infinite', spaceId],
      });
    },
  };
}
