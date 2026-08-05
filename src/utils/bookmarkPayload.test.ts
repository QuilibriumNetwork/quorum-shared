import { describe, it, expect } from 'vitest';
import type { Bookmark, LegacyBookmark } from '../types/bookmark';
import {
  hasLegacySenderIcon,
  stripBookmarkSenderIcon,
  stripBookmarkSenderIcons,
} from './bookmarkPayload';

const AVATAR = `data:image/png;base64,${'A'.repeat(34_000)}`;

const makeBookmark = (
  overrides: Partial<LegacyBookmark['cachedPreview']> = {},
  id = 'bm-1'
): Bookmark =>
  ({
    bookmarkId: id,
    messageId: `msg-${id}`,
    spaceId: 'space-1',
    channelId: 'channel-1',
    sourceType: 'channel',
    createdAt: 1_700_000_000_000,
    cachedPreview: {
      senderAddress: 'QmSender000000000000000000000000000000',
      senderName: 'Rosalind',
      textSnippet: 'the bit worth keeping',
      messageDate: 1_699_999_000_000,
      sourceName: 'Quorum Test > #general',
      contentType: 'text',
      ...overrides,
    },
  }) as Bookmark;

describe('stripBookmarkSenderIcon', () => {
  it('removes the embedded avatar', () => {
    const stripped = stripBookmarkSenderIcon(makeBookmark({ senderIcon: AVATAR }));
    expect('senderIcon' in stripped.cachedPreview).toBe(false);
  });

  it('keeps senderAddress, which is what the avatar is re-resolved from', () => {
    const stripped = stripBookmarkSenderIcon(makeBookmark({ senderIcon: AVATAR }));
    expect(stripped.cachedPreview.senderAddress).toBe(
      'QmSender000000000000000000000000000000'
    );
  });

  it('leaves every other preview field untouched', () => {
    const original = makeBookmark({
      senderIcon: AVATAR,
      imageUrl: 'https://example.test/a.png',
      thumbnailUrl: 'https://example.test/a-thumb.png',
      threadName: 'a thread',
      stickerId: 'sticker-9',
    });
    const stripped = stripBookmarkSenderIcon(original);

    expect(stripped.cachedPreview).toEqual({
      ...(original as LegacyBookmark).cachedPreview,
      senderIcon: undefined,
    });
    // ...and the identity fields outside the preview survive too.
    expect(stripped.bookmarkId).toBe(original.bookmarkId);
    expect(stripped.messageId).toBe(original.messageId);
    expect(stripped.createdAt).toBe(original.createdAt);
  });

  it('does not mutate the input', () => {
    const original = makeBookmark({ senderIcon: AVATAR });
    stripBookmarkSenderIcon(original);
    expect((original as LegacyBookmark).cachedPreview.senderIcon).toBe(AVATAR);
  });

  it('returns the same reference when there is nothing to strip', () => {
    // Callers use identity to decide whether a DB rewrite is needed.
    const clean = makeBookmark();
    expect(stripBookmarkSenderIcon(clean)).toBe(clean);
  });

  it('still rewrites a present-but-empty senderIcon', () => {
    // A present key costs bytes in the serialized blob, and a sweep that
    // skipped it would re-visit the same row on every launch.
    const empty = makeBookmark({ senderIcon: '' });
    const stripped = stripBookmarkSenderIcon(empty);
    expect(stripped).not.toBe(empty);
    expect('senderIcon' in stripped.cachedPreview).toBe(false);
  });
});

describe('hasLegacySenderIcon', () => {
  it('is true for a bookmark carrying an avatar', () => {
    expect(hasLegacySenderIcon(makeBookmark({ senderIcon: AVATAR }))).toBe(true);
  });

  it('is false once stripped, and false for an empty value', () => {
    expect(hasLegacySenderIcon(makeBookmark())).toBe(false);
    expect(hasLegacySenderIcon(makeBookmark({ senderIcon: '' }))).toBe(false);
  });
});

describe('stripBookmarkSenderIcons', () => {
  it('strips a mixed collection and counts only what it changed', () => {
    const result = stripBookmarkSenderIcons([
      makeBookmark({ senderIcon: AVATAR }, 'bm-1'),
      makeBookmark({}, 'bm-2'),
      makeBookmark({ senderIcon: AVATAR }, 'bm-3'),
    ]);

    expect(result.strippedCount).toBe(2);
    expect(result.bookmarks).toHaveLength(3);
    expect(result.bookmarks.every((b) => !hasLegacySenderIcon(b))).toBe(true);
  });

  it('reports the bytes it freed', () => {
    const result = stripBookmarkSenderIcons([
      makeBookmark({ senderIcon: AVATAR }, 'bm-1'),
      makeBookmark({ senderIcon: AVATAR }, 'bm-2'),
    ]);
    expect(result.bytesFreed).toBe(AVATAR.length * 2);
  });

  it('shrinks the serialized payload, which is the whole point', () => {
    // The measured account: 18 bookmarks, each with its own copy of a ~34 KB
    // avatar. Assert on the serialized size, not on the field, so the test
    // fails if a future change reintroduces the bytes by another route.
    const fat = Array.from({ length: 18 }, (_, i) =>
      makeBookmark({ senderIcon: AVATAR }, `bm-${i}`)
    );
    const before = JSON.stringify(fat).length;
    const after = JSON.stringify(stripBookmarkSenderIcons(fat).bookmarks).length;

    expect(before).toBeGreaterThan(600_000);
    expect(after).toBeLessThan(before * 0.05);
  });

  it('is a no-op on an already-clean collection', () => {
    const clean = [makeBookmark({}, 'bm-1'), makeBookmark({}, 'bm-2')];
    const result = stripBookmarkSenderIcons(clean);
    expect(result.strippedCount).toBe(0);
    expect(result.bytesFreed).toBe(0);
    expect(result.bookmarks[0]).toBe(clean[0]);
  });

  it('handles an empty list', () => {
    expect(stripBookmarkSenderIcons([])).toEqual({
      bookmarks: [],
      strippedCount: 0,
      bytesFreed: 0,
    });
  });
});
