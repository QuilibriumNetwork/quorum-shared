/**
 * Query key factories for React Query
 *
 * Consistent key structure across platforms for cache management
 */

export const queryKeys = {
  // Spaces
  spaces: {
    all: ['spaces'] as const,
    detail: (spaceId: string) => ['spaces', spaceId] as const,
    members: (spaceId: string) => ['spaces', spaceId, 'members'] as const,
    member: (spaceId: string, address: string) =>
      ['spaces', spaceId, 'members', address] as const,
  },

  // Channels
  channels: {
    bySpace: (spaceId: string) => ['channels', spaceId] as const,
    detail: (spaceId: string, channelId: string) =>
      ['channels', spaceId, channelId] as const,
  },

  // Messages
  messages: {
    infinite: (spaceId: string, channelId: string) =>
      ['messages', 'infinite', spaceId, channelId] as const,
    detail: (spaceId: string, channelId: string, messageId: string) =>
      ['messages', spaceId, channelId, messageId] as const,
    pinned: (spaceId: string, channelId: string) =>
      ['messages', 'pinned', spaceId, channelId] as const,
  },

  // Conversations (DMs)
  conversations: {
    all: (type: 'direct' | 'group') => ['conversations', type] as const,
    detail: (conversationId: string) => ['conversations', conversationId] as const,
    messages: (conversationId: string) =>
      ['conversations', conversationId, 'messages'] as const,
  },

  // User
  user: {
    config: (address: string) => ['user', 'config', address] as const,
    profile: (address: string) => ['user', 'profile', address] as const,
  },

  // Bookmarks
  bookmarks: {
    all: ['bookmarks'] as const,
    bySource: (sourceType: 'channel' | 'dm') =>
      ['bookmarks', sourceType] as const,
    bySpace: (spaceId: string) => ['bookmarks', 'space', spaceId] as const,
    check: (messageId: string) => ['bookmarks', 'check', messageId] as const,
  },
} as const;

// Type helpers for extracting key types
export type SpacesKey = typeof queryKeys.spaces.all;
export type SpaceDetailKey = ReturnType<typeof queryKeys.spaces.detail>;
export type ChannelsKey = ReturnType<typeof queryKeys.channels.bySpace>;
export type MessagesInfiniteKey = ReturnType<typeof queryKeys.messages.infinite>;
