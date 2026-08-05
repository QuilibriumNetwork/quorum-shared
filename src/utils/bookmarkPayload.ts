/**
 * Keeping bookmarks out of the config blob's size budget.
 *
 * The encrypted `UserConfig` blob is the ONLY cross-device transport for every
 * synced setting — the Spaces list, notification settings, mutes, device names,
 * per-conversation DM settings, user notes, the global profile. When it stops
 * uploading, all of that silently stops syncing while the device keeps looking
 * correct locally.
 *
 * Bookmarks were 75% of that blob (656 KB of 873 KB, measured 2026-08-05), and
 * 94% of the bookmark half was `cachedPreview.senderIcon`: a full base64 avatar
 * copied into every single bookmark rather than referenced. The value is a
 * render cache — `senderAddress` is retained and the avatar is resolved at
 * render through the same identity lookup every other surface uses — so
 * stripping it loses nothing but the frozen-at-bookmark-time snapshot.
 *
 * These helpers are the choke point. Apply them wherever bookmarks enter the
 * blob or the local store, so an old client's fat payload can neither be
 * re-uploaded nor re-adopted.
 *
 * See `.agents/issues/2026-08-05-bookmarks-are-75-percent-of-the-config-blob.md`.
 */

import type { Bookmark, LegacyBookmark } from '../types/bookmark';

export interface BookmarkStripResult {
  /** Bookmarks with no legacy preview fields. */
  bookmarks: Bookmark[];
  /** How many carried a `senderIcon`. */
  strippedCount: number;
  /**
   * Approximate bytes removed — the sum of the stripped strings' lengths.
   * Avatars are base64 ASCII, so length is a good stand-in for byte size and
   * this is only ever reported, never used for a decision.
   */
  bytesFreed: number;
}

/** Does this bookmark still carry an embedded sender avatar? */
export function hasLegacySenderIcon(bookmark: Bookmark): boolean {
  const preview = (bookmark as LegacyBookmark).cachedPreview;
  return typeof preview?.senderIcon === 'string' && preview.senderIcon.length > 0;
}

/**
 * Return the bookmark without `cachedPreview.senderIcon`.
 *
 * Returns the SAME reference when there is nothing to strip, so callers can use
 * identity to tell whether a rewrite is needed and skip a pointless DB write.
 */
export function stripBookmarkSenderIcon(bookmark: Bookmark): Bookmark {
  const preview = (bookmark as LegacyBookmark).cachedPreview;
  // `in`, not truthiness: a present-but-empty key still costs bytes in the
  // serialized blob, and leaving it behind would make the sweep re-run forever
  // on rows it believes it already fixed.
  if (!preview || !('senderIcon' in preview)) return bookmark;

  const { senderIcon: _dropped, ...rest } = preview;
  return { ...bookmark, cachedPreview: rest };
}

/** Strip a whole collection, reporting what it cost to keep. */
export function stripBookmarkSenderIcons(bookmarks: Bookmark[]): BookmarkStripResult {
  let strippedCount = 0;
  let bytesFreed = 0;

  const stripped = bookmarks.map((bookmark) => {
    const icon = (bookmark as LegacyBookmark).cachedPreview?.senderIcon;
    const next = stripBookmarkSenderIcon(bookmark);
    if (next !== bookmark) {
      strippedCount += 1;
      bytesFreed += icon?.length ?? 0;
    }
    return next;
  });

  return { bookmarks: stripped, strippedCount, bytesFreed };
}
