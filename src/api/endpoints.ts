/**
 * API endpoint definitions
 */

/** Base API configuration */
export interface ApiConfig {
  baseUrl: string;
  timeout?: number;
}

/** API endpoint builders */
export const endpoints = {
  // Spaces
  spaces: {
    list: () => '/spaces',
    detail: (spaceId: string) => `/spaces/${spaceId}`,
    members: (spaceId: string) => `/spaces/${spaceId}/members`,
    join: (spaceId: string) => `/spaces/${spaceId}/join`,
    leave: (spaceId: string) => `/spaces/${spaceId}/leave`,
  },

  // Channels
  channels: {
    list: (spaceId: string) => `/spaces/${spaceId}/channels`,
    detail: (spaceId: string, channelId: string) =>
      `/spaces/${spaceId}/channels/${channelId}`,
  },

  // Messages
  messages: {
    list: (spaceId: string, channelId: string) =>
      `/spaces/${spaceId}/channels/${channelId}/messages`,
    detail: (spaceId: string, channelId: string, messageId: string) =>
      `/spaces/${spaceId}/channels/${channelId}/messages/${messageId}`,
    send: (spaceId: string, channelId: string) =>
      `/spaces/${spaceId}/channels/${channelId}/messages`,
    react: (spaceId: string, channelId: string, messageId: string) =>
      `/spaces/${spaceId}/channels/${channelId}/messages/${messageId}/reactions`,
    pin: (spaceId: string, channelId: string, messageId: string) =>
      `/spaces/${spaceId}/channels/${channelId}/messages/${messageId}/pin`,
  },

  // Conversations (DMs)
  conversations: {
    list: () => '/conversations',
    detail: (conversationId: string) => `/conversations/${conversationId}`,
    messages: (conversationId: string) => `/conversations/${conversationId}/messages`,
  },

  // User
  user: {
    config: () => '/user/config',
    profile: () => '/user/profile',
    notifications: () => '/user/notifications',
  },

  // Search
  search: {
    messages: (spaceId: string) => `/spaces/${spaceId}/search/messages`,
    members: (spaceId: string) => `/spaces/${spaceId}/search/members`,
  },
} as const;

/** HTTP methods */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Request options */
export interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  signal?: AbortSignal;
}

/** Pagination parameters */
export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

/** Message list parameters */
export interface MessageListParams extends PaginationParams {
  before?: string;
  after?: string;
  around?: string;
}
