/**
 * Bookmark types for Quorum
 */

export type BookmarkPreview = {
  senderAddress: string;
  senderName: string;
  threadName?: string;
  textSnippet: string;
  messageDate: number;
  sourceName: string;
  contentType: 'text' | 'image' | 'sticker';
  imageUrl?: string;
  thumbnailUrl?: string;
  stickerId?: string;
};

export type Bookmark = {
  bookmarkId: string;
  messageId: string;
  spaceId?: string;
  channelId?: string;
  conversationId?: string;
  sourceType: 'channel' | 'dm';
  createdAt: number;
  threadId?: string;
  cachedPreview: BookmarkPreview;
};

/**
 * A preview as older clients wrote it — `BookmarkPreview` plus the fields that
 * are no longer synced.
 *
 * `senderIcon` embedded a full base64 avatar in EVERY bookmark. Measured
 * 2026-08-05 on a real account: 18 bookmarks at ~34 KB apiece, 619.8 KB total
 * — 94% of all bookmark data and 69% of the whole encrypted config blob,
 * against a ~1 MB working ceiling for that blob. The avatar is a render cache,
 * rebuildable from `senderAddress`, so it is resolved at render instead.
 *
 * It is absent from `BookmarkPreview` so nothing can write it again; it is
 * declared here only so `stripBookmarkSenderIcon` can READ it off blobs and
 * IndexedDB rows left by older clients.
 *
 * See `.agents/issues/2026-08-05-bookmarks-are-75-percent-of-the-config-blob.md`.
 */
export type LegacyBookmarkPreview = BookmarkPreview & {
  senderIcon?: string;
};

export type LegacyBookmark = Omit<Bookmark, 'cachedPreview'> & {
  cachedPreview: LegacyBookmarkPreview;
};

export const BOOKMARKS_CONFIG = {
  MAX_BOOKMARKS: 200,
  PREVIEW_SNIPPET_LENGTH: 150,
} as const;
