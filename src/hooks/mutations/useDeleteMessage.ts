/**
 * useDeleteMessage mutation hook
 *
 * Delete a message with optimistic updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StorageAdapter, GetMessagesResult } from '../../storage';
import type { QuorumApiClient, DeleteMessageParams } from '../../api';
import { queryKeys } from '../keys';

export interface UseDeleteMessageOptions {
  storage: StorageAdapter;
  apiClient: QuorumApiClient;
}

export function useDeleteMessage({ storage, apiClient }: UseDeleteMessageOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteMessageParams): Promise<void> => {
      return apiClient.deleteMessage(params);
    },

    onMutate: async (params) => {
      const key = queryKeys.messages.infinite(params.spaceId, params.channelId);

      await queryClient.cancelQueries({ queryKey: key });
      const previousData = queryClient.getQueryData(key);

      // Optimistically remove message
      queryClient.setQueryData(key, (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter(
              (message) => message.messageId !== params.messageId
            ),
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

    onSuccess: async (_, params) => {
      // Remove from storage
      await storage.deleteMessage(params.messageId);
    },

    onSettled: (data, err, params) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.infinite(params.spaceId, params.channelId),
      });
    },
  });
}
