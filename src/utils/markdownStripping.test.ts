/**
 * Markdown stripping for previews and notifications.
 *
 * Written 2026-08-24 for the same reason as `messageLinkUtils.test.ts`: the
 * module had no tests, which only came to light when eslint's first run on this
 * repo flagged a redundant `\[` in `stripMarkdown`'s unescape pattern and a
 * mutation probe left the suite green.
 *
 * The subject is the last line of `stripMarkdown`, which undoes the escaping
 * `remarkStringify` adds. Its character class contains `[` and `]`, and inside a
 * class both are literal — so `\[` and `[` mean the same thing there. These
 * tests pin the observable behaviour so that equivalence is measured rather than
 * argued.
 */
import { describe, it, expect } from 'vitest';
import { stripMarkdown } from './markdownStripping';

describe('stripMarkdown', () => {
  it('removes emphasis and heading syntax', () => {
    expect(stripMarkdown('# Title')).toBe('Title');
    expect(stripMarkdown('**bold** and *italic*')).toBe('bold and italic');
  });

  // The edited character class. Square brackets are the interesting members:
  // they are what `\[` used to name redundantly.
  it('unescapes square brackets that the stringifier escaped', () => {
    expect(stripMarkdown('\\[not a link\\]')).toBe('[not a link]');
  });

  it('unescapes the rest of the class it names', () => {
    // One representative per group, so a member being dropped from the class
    // shows up here rather than in production.
    const cases: [string, string][] = [
      ['\\# hash', '# hash'],
      ['\\* star', '* star'],
      ['\\_ underscore', '_ underscore'],
      ['\\> angle', '> angle'],
      ['\\! bang', '! bang'],
      ['\\(paren\\)', '(paren)'],
      ['\\{brace\\}', '{brace}'],
    ];
    for (const [input, expected] of cases) {
      expect(stripMarkdown(input), input).toBe(expected);
    }
  });

  it('strips youtube embeds and invite cards entirely', () => {
    expect(stripMarkdown('before ![youtube-embed](https://y.tld/x) after')).toBe(
      'before  after'
    );
    expect(stripMarkdown('![invite-card](https://q.tld/i)')).toBe('');
  });

  it('preserves mention markers, which must survive stripping', () => {
    // Mentions are swapped for placeholders and restored, precisely so the
    // stripper does not treat `@<...>` as an HTML tag and delete it.
    expect(stripMarkdown('hello @<QmAbc123> there')).toContain('@<QmAbc123>');
  });

  it('returns the input unchanged when there is no markdown', () => {
    expect(stripMarkdown('plain text')).toBe('plain text');
  });
});
