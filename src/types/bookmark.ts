/**
 * Bookmark types for Quorum
 */

export type Bookmark = {
  bookmarkId: string;
  messageId: string;
  spaceId?: string;
  channelId?: string;
  conversationId?: string;
  sourceType: 'channel' | 'dm';
  createdAt: number;
  cachedPreview: {
    senderAddress: string;
    senderName: string;
    textSnippet: string;
    messageDate: number;
    sourceName: string;
    contentType: 'text' | 'image' | 'sticker';
    imageUrl?: string;
    thumbnailUrl?: string;
    stickerId?: string;
  };
};

export const BOOKMARKS_CONFIG = {
  MAX_BOOKMARKS: 200,
  PREVIEW_SNIPPET_LENGTH: 150,
} as const;
