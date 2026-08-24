/**
 * Message-link parsing.
 *
 * Written 2026-08-24 because the module had NO tests, and that was discovered
 * the honest way: eslint's first run on this repo flagged a redundant `\/`
 * inside the character class in `parseMessageLink`, the escape was removed, and
 * a mutation probe (`/spaces/` → `/spacez/`) left the whole suite green. A
 * change nothing can falsify is a change shipped on reasoning alone.
 *
 * The `[^/]` class is the subject: it must stop at the FIRST slash, so a space
 * id can never swallow the channel segment.
 */
import { describe, it, expect } from 'vitest';
import { parseMessageLink, isMessageLink } from './messageLinkUtils';

describe('parseMessageLink', () => {
  it('splits a relative link into its three ids', () => {
    expect(parseMessageLink('/spaces/space1/channel1#msg-abc123')).toEqual({
      spaceId: 'space1',
      channelId: 'channel1',
      messageId: 'abc123',
      isRelative: true,
    });
  });

  it('parses an absolute link and reports it as not relative', () => {
    const parsed = parseMessageLink('https://example.com/spaces/s2/c2#msg-xyz');
    expect(parsed).toMatchObject({ spaceId: 's2', channelId: 'c2', messageId: 'xyz' });
    expect(parsed?.isRelative).toBe(false);
  });

  // The point of `[^/]`, and it needs THREE path segments to show.
  //
  // With only `/spaces/a/b#msg-x` a greedy `(.+)` produces the same answer:
  // it grabs everything, then backtracks to the single available slash. The
  // first version of this test used exactly that URL, and a mutation probe
  // swapping `[^/]+` for `.+` left it green — an assertion that passes either
  // way is worse than no assertion, because it manufactures confidence.
  //
  // Add a second slash and the two diverge: `[^/]+` stops at the first, giving
  // spaceId `a`; greedy `.+` runs to the LAST, giving `a/b`.
  it('stops the space id at the first slash, not the last', () => {
    const parsed = parseMessageLink('/spaces/a/b/c#msg-m1');
    expect(parsed?.spaceId).toBe('a');
    expect(parsed?.channelId).toBe('b/c');
  });

  it('accepts the id characters the pattern allows, and nothing else', () => {
    expect(parseMessageLink('/spaces/s/c#msg-A-z_0-9')?.messageId).toBe('A-z_0-9');
    // `.` is outside [a-zA-Z0-9_-], so the whole link fails rather than
    // silently truncating the id.
    expect(parseMessageLink('/spaces/s/c#msg-has.dot')).toBeNull();
  });

  it('returns null for anything that is not a message link', () => {
    for (const url of [
      '',
      '/spaces/s/c',                    // no fragment
      '/spaces/s/c#msg-',               // empty id
      '/spaces//c#msg-m1',              // empty space id — [^/]+ needs one char
      'https://example.com/other/s/c#msg-m1',
      '/spaces/s/c#msg-m1/trailing',    // anchored to end of string
    ]) {
      expect(parseMessageLink(url), url).toBeNull();
    }
  });
});

describe('isMessageLink', () => {
  it('agrees with parseMessageLink', () => {
    expect(isMessageLink('/spaces/s/c#msg-m1')).toBe(true);
    expect(isMessageLink('/spaces/s/c')).toBe(false);
  });
});
