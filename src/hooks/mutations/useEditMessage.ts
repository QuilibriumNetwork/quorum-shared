/**
 * useEditMessage mutation hook
 *
 * Edit a message with optimistic updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message, PostMessage } from '../../types';
import type { StorageAdapter, GetMessagesResult } from '../../storage';
import type { QuorumApiClient, EditMessageParams } from '../../api';
import { queryKeys } from '../keys';

export interface UseEditMessageOptions {
  storage: StorageAdapter;
  apiClient: QuorumApiClient;
}

export function useEditMessage({ storage, apiClient }: UseEditMessageOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: EditMessageParams): Promise<Message> => {
      return apiClient.editMessage(params);
    },

    onMutate: async (params) => {
      const key = queryKeys.messages.infinite(params.spaceId, params.channelId);

      await queryClient.cancelQueries({ queryKey: key });
      const previousData = queryClient.getQueryData(key);

      // Optimistically update message
      queryClient.setQueryData(key, (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((message) => {
              if (message.messageId !== params.messageId) return message;

              // Only update if it's a post message
              if (message.content.type !== 'post') return message;

              return {
                ...message,
                modifiedDate: Date.now(),
                content: {
                  ...message.content,
                  text: params.text,
                } as PostMessage,
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

    onSuccess: async (message) => {
      // Persist updated message to storage
      await storage.saveMessage(
        message,
        message.modifiedDate,
        message.content.senderId,
        'space',
        '',
        ''
      );
    },

    onSettled: (data, err, params) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.infinite(params.spaceId, params.channelId),
      });
    },
  });
}
