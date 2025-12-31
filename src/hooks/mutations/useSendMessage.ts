/**
 * useSendMessage mutation hook
 *
 * Sends a message with optimistic updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message } from '../../types';
import type { StorageAdapter, GetMessagesResult } from '../../storage';
import type { QuorumApiClient, SendMessageParams } from '../../api';
import { queryKeys } from '../keys';

export interface UseSendMessageOptions {
  storage: StorageAdapter;
  apiClient: QuorumApiClient;
  currentUserId: string;
}

export function useSendMessage({
  storage,
  apiClient,
  currentUserId,
}: UseSendMessageOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendMessageParams): Promise<Message> => {
      return apiClient.sendMessage(params);
    },

    onMutate: async (params) => {
      const key = queryKeys.messages.infinite(params.spaceId, params.channelId);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(key);

      // Create optimistic message
      const optimisticMessage: Message = {
        messageId: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        channelId: params.channelId,
        spaceId: params.spaceId,
        digestAlgorithm: '',
        nonce: '',
        createdDate: Date.now(),
        modifiedDate: Date.now(),
        lastModifiedHash: '',
        content: {
          type: 'post',
          senderId: currentUserId,
          text: params.text,
          repliesToMessageId: params.repliesToMessageId,
        },
        reactions: [],
        mentions: { memberIds: [], roleIds: [], channelIds: [] },
        sendStatus: 'sending',
      };

      // Optimistically add to cache
      queryClient.setQueryData(key, (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page, index) => {
            if (index === 0) {
              return {
                ...page,
                messages: [optimisticMessage, ...page.messages],
              };
            }
            return page;
          }),
        };
      });

      return { previousData, optimisticMessage };
    },

    onError: (err, params, context) => {
      // Rollback on error
      if (context?.previousData) {
        const key = queryKeys.messages.infinite(params.spaceId, params.channelId);
        queryClient.setQueryData(key, context.previousData);
      }
    },

    onSuccess: async (message, params, context) => {
      // Replace optimistic message with real one
      const key = queryKeys.messages.infinite(params.spaceId, params.channelId);

      queryClient.setQueryData(key, (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page, index) => {
            if (index === 0) {
              return {
                ...page,
                messages: page.messages.map((m) =>
                  m.messageId === context?.optimisticMessage.messageId ? message : m
                ),
              };
            }
            return page;
          }),
        };
      });

      // Persist to storage
      await storage.saveMessage(
        message,
        message.createdDate,
        currentUserId,
        'space',
        '',
        ''
      );
    },

    onSettled: (data, err, params) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.infinite(params.spaceId, params.channelId),
      });
    },
  });
}
