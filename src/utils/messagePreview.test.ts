/**
 * Conversation-list preview text.
 *
 * Written 2026-08-24 alongside the eslint rollout. The `case 'post'` arm
 * declared a `const` without braces, which eslint's `no-case-declarations`
 * flagged: an unbraced declaration is hoisted into the WHOLE switch, so any
 * later case touching that name would hit a temporal-dead-zone ReferenceError
 * at runtime rather than failing to compile. Braces were added — and a mutation
 * probe showed the module had no tests at all, so nothing would have caught it
 * if the edit had been wrong.
 *
 * `Message` is deliberately not imported: these fixtures only need the two
 * fields the function reads, and casting keeps the test from breaking every
 * time an unrelated field is added to the real type.
 */
import { describe, it, expect } from 'vitest';
import { generateMessagePreview } from './messagePreview';

const msg = (content: unknown) =>
  ({ content }) as Parameters<typeof generateMessagePreview>[0];

describe('generateMessagePreview', () => {
  it('shows the text of a post, with markdown stripped', () => {
    expect(generateMessagePreview(msg({ type: 'post', text: '**hi** there' }))).toEqual({
      text: 'hi there',
    });
  });

  it('joins a post whose text arrived as an array', () => {
    expect(
      generateMessagePreview(msg({ type: 'post', text: ['one', 'two'] })).text
    ).toBe('one two');
  });

  it('truncates to the requested length', () => {
    const long = 'x'.repeat(200);
    const out = generateMessagePreview(msg({ type: 'post', text: long }), 20).text;
    expect(out.length).toBeLessThanOrEqual(21); // 20 plus a possible ellipsis
    expect(out.length).toBeGreaterThan(0);
  });

  it('labels an embed as a photo', () => {
    expect(generateMessagePreview(msg({ type: 'embed', imageUrl: 'x' }))).toEqual({
      text: 'Photo',
      icon: 'image',
    });
  });

  it('reports a deleted message', () => {
    expect(generateMessagePreview(msg({ type: 'remove-message' }))).toEqual({
      text: 'Message deleted',
    });
  });

  // The cases that share a body. Each must return empty so the conversation
  // list falls back to the previous real message rather than showing a system
  // event.
  //
  // Honest limit, established by mutation: this test CANNOT detect a label
  // being dropped from the fallthrough chain, because `default` returns the
  // same `{ text: '' }` — removing `case 'pin':` leaves the suite green. No
  // assertion can distinguish them while the two branches behave identically,
  // so this is a documentation test, not a discriminating one. What it does
  // catch is a change to what these types RETURN — someone making `join`
  // render "User joined", or altering `default`.
  it('returns empty for every system/action message', () => {
    for (const type of [
      'edit-message',
      'update-profile',
      'reaction',
      'remove-reaction',
      'pin',
      'join',
      'leave',
      'kick',
    ]) {
      expect(generateMessagePreview(msg({ type })), type).toEqual({ text: '' });
    }
  });

  it('returns empty for an unknown type and for a message with no content', () => {
    expect(generateMessagePreview(msg({ type: 'something-new' }))).toEqual({ text: '' });
    expect(generateMessagePreview(undefined)).toEqual({ text: '' });
  });
});
