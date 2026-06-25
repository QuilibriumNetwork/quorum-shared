/**
 * Test suite for the shared message-preprocessing pipeline.
 *
 * Covers the full transform matrix plus the six+ desktop↔mobile divergences the
 * promotion reconciled (see the migration task: angle-bracket autolink skip,
 * markdown-link protection scope, `@everyone` authorization gate, header regex,
 * legacy bare-mention shim, and the `@<roleId>`/`@roleTag` dual role match).
 *
 * This is the durable home for these tests — desktop's copy was inlined and
 * untestable; mobile has no test runner. One suite covers both platforms.
 */

import { describe, it, expect } from 'vitest';
import {
  processMentions,
  processRoleMentions,
  processChannelMentions,
  processURLs,
  convertHeadersToH3,
  fixUnclosedCodeBlocks,
  getProtectedRegions,
  isInProtectedRegion,
  prepareMessageContent,
  hasMarkdown,
} from './messagePreprocessing';
import type { SpaceMember, Role, Channel } from '../types';

// A valid IPFS-CID-shaped address (matches createIPFSCIDRegex).
const ADDR = 'QmV5xWMo5CYSxgAAy6emKFZZPCKwCsBZKZxXD3mCUZF2nX';

const role = (over: Partial<Role> = {}): Role => ({
  roleId: '11111111-1111-1111-1111-111111111111',
  displayName: 'Admin',
  roleTag: 'admin',
  color: 'blue',
  members: [],
  permissions: [],
  ...over,
});

const channel = (over: Partial<Channel> = {}): Channel => ({
  channelId: 'chan-123',
  spaceId: 'space-1',
  channelName: 'general',
  createdDate: 0,
  modifiedDate: 0,
  ...over,
});

const member = (over: Partial<SpaceMember> = {}): SpaceMember =>
  ({
    address: ADDR,
    name: 'alice',
    display_name: 'Alice',
    inbox_address: 'inbox-1',
    ...over,
  }) as SpaceMember;

// ---------------------------------------------------------------------------
// processMentions
// ---------------------------------------------------------------------------

describe('processMentions', () => {
  it('tokenizes canonical @<address> user mentions', () => {
    expect(processMentions(`hi @<${ADDR}> there`)).toBe(`hi <<<MENTION_USER:${ADDR}>>> there`);
  });

  it('tokenizes @everyone only when authorized', () => {
    expect(processMentions('hey @everyone', [], true)).toBe('hey <<<MENTION_EVERYONE>>>');
  });

  it('leaves @everyone as plain text when NOT authorized', () => {
    expect(processMentions('hey @everyone', [], false)).toBe('hey @everyone');
  });

  it('respects word boundaries — x@everyone does not match', () => {
    expect(processMentions('x@everyone', [], true)).toBe('x@everyone');
  });

  it('tokenizes a mention at string start and end', () => {
    expect(processMentions(`@<${ADDR}>`)).toBe(`<<<MENTION_USER:${ADDR}>>>`);
  });

  it('does NOT tokenize inside inline code', () => {
    expect(processMentions(`\`@<${ADDR}>\``)).toBe(`\`@<${ADDR}>\``);
  });

  it('does NOT tokenize inside a fenced code block', () => {
    const text = '```\n@<' + ADDR + '>\n```';
    expect(processMentions(text)).toBe(text);
  });

  it('does NOT tokenize inside a markdown link text (divergence #2)', () => {
    const text = `[ping @<${ADDR}>](https://x.com)`;
    expect(processMentions(text)).toBe(text);
  });

  describe('legacy bare @address shim (divergence #5)', () => {
    it('tokenizes a bare @name when it resolves to a member', () => {
      expect(processMentions('hi @alice', [member()])).toBe(`hi <<<MENTION_USER:${ADDR}>>>`);
    });

    it('leaves a bare @word as plain text when no members are supplied (desktop)', () => {
      expect(processMentions('hi @alice')).toBe('hi @alice');
    });

    it('leaves a bare @word that resolves to no member as plain text', () => {
      expect(processMentions('hi @nobody', [member()])).toBe('hi @nobody');
    });
  });
});

// ---------------------------------------------------------------------------
// processRoleMentions
// ---------------------------------------------------------------------------

describe('processRoleMentions', () => {
  it('tokenizes a bare @roleTag against the roles array', () => {
    expect(processRoleMentions('ping @admin now', [role()])).toBe(
      'ping <<<MENTION_ROLE:admin:Admin>>> now',
    );
  });

  it('tokenizes the canonical @<roleId> form (divergence #8)', () => {
    const r = role();
    expect(processRoleMentions(`ping @<${r.roleId}> now`, [r])).toBe(
      'ping <<<MENTION_ROLE:admin:Admin>>> now',
    );
  });

  it('returns text unchanged when no roles are supplied', () => {
    expect(processRoleMentions('ping @admin', [])).toBe('ping @admin');
  });

  it('does not tokenize @roleTag that names no existing role', () => {
    expect(processRoleMentions('ping @notarole', [role()])).toBe('ping @notarole');
  });

  it('respects word boundaries — @adminx does not match @admin', () => {
    expect(processRoleMentions('ping @adminx', [role()])).toBe('ping @adminx');
  });

  it('does NOT tokenize inside code', () => {
    expect(processRoleMentions('`@admin`', [role()])).toBe('`@admin`');
  });
});

// ---------------------------------------------------------------------------
// processChannelMentions
// ---------------------------------------------------------------------------

describe('processChannelMentions', () => {
  it('tokenizes #<channelId> against the channels array', () => {
    expect(processChannelMentions('see #<chan-123> please', [channel()])).toBe(
      'see <<<MENTION_CHANNEL:chan-123:general>>> please',
    );
  });

  it('returns text unchanged when no channels are supplied', () => {
    expect(processChannelMentions('see #<chan-123>', [])).toBe('see #<chan-123>');
  });

  it('does not tokenize an unknown channel id', () => {
    expect(processChannelMentions('see #<chan-999>', [channel()])).toBe('see #<chan-999>');
  });

  it('does NOT tokenize inside code', () => {
    expect(processChannelMentions('`#<chan-123>`', [channel()])).toBe('`#<chan-123>`');
  });
});

// ---------------------------------------------------------------------------
// processURLs
// ---------------------------------------------------------------------------

describe('processURLs', () => {
  it('wraps a bare URL as a markdown link', () => {
    expect(processURLs('go to https://x.com now')).toBe('go to [https://x.com](https://x.com) now');
  });

  it('skips URLs inside fenced code', () => {
    const text = '```\nhttps://x.com\n```';
    expect(processURLs(text)).toBe(text);
  });

  it('skips URLs inside inline code', () => {
    expect(processURLs('`https://x.com`')).toBe('`https://x.com`');
  });

  it('skips a URL already inside an existing markdown link', () => {
    const text = '[label](https://x.com)';
    expect(processURLs(text)).toBe(text);
  });

  it('skips a <URL> angle-bracket autolink (divergence #1)', () => {
    const text = '<https://x.com>';
    expect(processURLs(text)).toBe(text);
  });

  it('wraps a bare URL even when another is autolinked nearby', () => {
    expect(processURLs('<https://a.com> and https://b.com')).toBe(
      '<https://a.com> and [https://b.com](https://b.com)',
    );
  });
});

// ---------------------------------------------------------------------------
// convertHeadersToH3 (divergence #4)
// ---------------------------------------------------------------------------

describe('convertHeadersToH3', () => {
  it('converts # to ###', () => {
    expect(convertHeadersToH3('# Title')).toBe('### Title');
  });

  it('converts ## to ###', () => {
    expect(convertHeadersToH3('## Title')).toBe('### Title');
  });

  it('leaves ### unchanged', () => {
    expect(convertHeadersToH3('### Title')).toBe('### Title');
  });

  it('leaves #### unchanged', () => {
    expect(convertHeadersToH3('#### Title')).toBe('#### Title');
  });

  it('converts headers on multiple lines', () => {
    expect(convertHeadersToH3('# A\n## B\ntext')).toBe('### A\n### B\ntext');
  });

  it('does not convert a # inside a fenced code block', () => {
    const text = '```\n# not a header\n```';
    expect(convertHeadersToH3(text)).toBe(text);
  });

  it('does not convert a mid-line #', () => {
    expect(convertHeadersToH3('this # is not a header')).toBe('this # is not a header');
  });
});

// ---------------------------------------------------------------------------
// fixUnclosedCodeBlocks
// ---------------------------------------------------------------------------

describe('fixUnclosedCodeBlocks', () => {
  it('appends a closing fence when the count is odd', () => {
    expect(fixUnclosedCodeBlocks('```\ncode')).toBe('```\ncode\n```');
  });

  it('leaves balanced fences untouched', () => {
    const text = '```\ncode\n```';
    expect(fixUnclosedCodeBlocks(text)).toBe(text);
  });

  it('leaves text with no fences untouched', () => {
    expect(fixUnclosedCodeBlocks('plain text')).toBe('plain text');
  });

  it('does not double-add a newline when the open fence line ends with one', () => {
    expect(fixUnclosedCodeBlocks('```\ncode\n')).toBe('```\ncode\n```');
  });
});

// ---------------------------------------------------------------------------
// getProtectedRegions / isInProtectedRegion
// ---------------------------------------------------------------------------

describe('getProtectedRegions', () => {
  it('protects fenced code, inline code, and markdown links', () => {
    const text = '`a` [b](u) ```c```';
    const regions = getProtectedRegions(text);
    expect(regions.length).toBeGreaterThanOrEqual(3);
  });

  it('isInProtectedRegion reports inside vs outside correctly', () => {
    const text = 'x `code` y';
    const regions = getProtectedRegions(text);
    const codeIdx = text.indexOf('code');
    expect(isInProtectedRegion(codeIdx, regions)).toBe(true);
    expect(isInProtectedRegion(0, regions)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasMarkdown
// ---------------------------------------------------------------------------

describe('hasMarkdown', () => {
  it('returns false for a plain chat line', () => {
    expect(hasMarkdown('just a normal message')).toBe(false);
  });

  it('returns false for a bare @mention / #channel / URL', () => {
    expect(hasMarkdown(`@<${ADDR}>`)).toBe(false);
    expect(hasMarkdown('#<chan-123>')).toBe(false);
    expect(hasMarkdown('https://x.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasMarkdown('')).toBe(false);
  });

  it.each([
    ['**bold**', '**b**'],
    ['__bold__', '__b__'],
    ['italic *', 'an *i* word'],
    ['italic _', 'an _i_ word'],
    ['strikethrough', '~~s~~'],
    ['inline code', 'a `c` b'],
    ['fenced code', '```\nx\n```'],
    ['spoiler', '||s||'],
    ['heading', '# h'],
    ['blockquote', '> q'],
    ['unordered list', '- item'],
    ['ordered list', '1. item'],
    ['thematic break', '---'],
  ])('returns true for %s', (_label, input) => {
    expect(hasMarkdown(input)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prepareMessageContent (orchestrator — mobile path)
// ---------------------------------------------------------------------------

describe('prepareMessageContent', () => {
  it('normalizes CRLF newlines (divergence #6)', () => {
    expect(prepareMessageContent('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('runs the full pipeline: mention + role + channel + url + header', () => {
    const out = prepareMessageContent(
      `# hi @<${ADDR}> @admin #<chan-123> https://x.com`,
      {
        members: [],
        roles: [role()],
        channels: [channel()],
        everyoneAuthorized: false,
      },
    );
    expect(out).toContain('### hi');
    expect(out).toContain(`<<<MENTION_USER:${ADDR}>>>`);
    expect(out).toContain('<<<MENTION_ROLE:admin:Admin>>>');
    expect(out).toContain('<<<MENTION_CHANNEL:chan-123:general>>>');
    expect(out).toContain('[https://x.com](https://x.com)');
  });

  it('balances an unclosed fence at the end', () => {
    expect(prepareMessageContent('```\ncode')).toBe('```\ncode\n```');
  });
});
