/**
 * useReaction mutation hooks
 *
 * Add and remove reactions with optimistic updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message, Reaction } from '../../types';
import type { StorageAdapter, GetMessagesResult } from '../../storage';
import type { QuorumApiClient, AddReactionParams, RemoveReactionParams } from '../../api';
import { queryKeys } from '../keys';

export interface UseReactionOptions {
  storage: StorageAdapter;
  apiClient: QuorumApiClient;
  currentUserId: string;
}

export function useAddReaction({
  storage,
  apiClient,
  currentUserId,
}: UseReactionOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddReactionParams): Promise<void> => {
      return apiClient.addReaction(params);
    },

    onMutate: async (params) => {
      const key = queryKeys.messages.infinite(params.spaceId, params.channelId);

      await queryClient.cancelQueries({ queryKey: key });
      const previousData = queryClient.getQueryData(key);

      // Optimistically add reaction
      queryClient.setQueryData(key, (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((message) => {
              if (message.messageId !== params.messageId) return message;

              const existingReaction = message.reactions.find(
                (r) => r.emojiName === params.reaction
              );

              if (existingReaction) {
                // Add user to existing reaction
                return {
                  ...message,
                  reactions: message.reactions.map((r) =>
                    r.emojiName === params.reaction
                      ? {
                          ...r,
                          count: r.count + 1,
                          memberIds: [...r.memberIds, currentUserId],
                        }
                      : r
                  ),
                };
              } else {
                // Create new reaction
                const newReaction: Reaction = {
                  emojiId: params.reaction,
                  emojiName: params.reaction,
                  spaceId: params.spaceId,
                  count: 1,
                  memberIds: [currentUserId],
                };
                return {
                  ...message,
                  reactions: [...message.reactions, newReaction],
                };
              }
            }),
          })),
        };
      });

      return { previousData };
    },

    onError: (err, params, context) => {
      if (context?.previousData) {
        const key = queryKeys.messages.infinite(params.spaceId, params.channelId);
        queryClient.setQueryData(key, context.previousData);
      }
    },
  });
}

export function useRemoveReaction({
  storage,
  apiClient,
  currentUserId,
}: UseReactionOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RemoveReactionParams): Promise<void> => {
      return apiClient.removeReaction(params);
    },

    onMutate: async (params) => {
      const key = queryKeys.messages.infinite(params.spaceId, params.channelId);

      await queryClient.cancelQueries({ queryKey: key });
      const previousData = queryClient.getQueryData(key);

      // Optimistically remove reaction
      queryClient.setQueryData(key, (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((message) => {
              if (message.messageId !== params.messageId) return message;

              return {
                ...message,
                reactions: message.reactions
                  .map((r) => {
                    if (r.emojiName !== params.reaction) return r;

                    const newMemberIds = r.memberIds.filter(
                      (id) => id !== currentUserId
                    );

                    if (newMemberIds.length === 0) {
                      return null; // Remove reaction entirely
                    }

                    return {
                      ...r,
                      count: newMemberIds.length,
                      memberIds: newMemberIds,
                    };
                  })
                  .filter((r): r is Reaction => r !== null),
              };
            }),
          })),
        };
      });

      return { previousData };
    },

    onError: (err, params, context) => {
      if (context?.previousData) {
        const key = queryKeys.messages.infinite(params.spaceId, params.channelId);
        queryClient.setQueryData(key, context.previousData);
      }
    },
  });
}
