/**
 * Message content preprocessing — pure string transforms shared by the
 * desktop (react-markdown) and mobile (hand-rolled RN) markdown renderers.
 *
 * Every function here is platform-agnostic (string in, string out); only the
 * final React rendering step is platform-specific. The pipeline converts inline
 * mentions/roles/channels into internal tokens of the form
 * `<<<MENTION_USER:address>>>` BEFORE the markdown layer runs, so the markdown
 * parser never mangles an `@<address>` into emphasis/code/etc. The tokens use
 * `<<<...>>>` delimiters that don't collide with any markdown syntax.
 *
 * The token vocabulary is a CROSS-PLATFORM PROTOCOL: `markdownStripping.ts`
 * (+ `.native.ts`) already strips these exact tokens from message previews, so
 * both renderers must produce them identically. This module is the single
 * canonical producer.
 *
 * Internal token formats:
 *   <<<MENTION_EVERYONE>>>
 *   <<<MENTION_USER:address>>>
 *   <<<MENTION_ROLE:roleTag:displayName>>>
 *   <<<MENTION_CHANNEL:channelId:channelName>>>
 * Spoilers (`||text||`) are NOT tokenized here; each renderer detects them inline.
 *
 * Desktop-only steps (invite links, standalone YouTube, message links) are NOT
 * part of this module — desktop keeps those inlined and calls the individual
 * functions below in its own order. Only mobile uses the `prepareMessageContent`
 * orchestrator.
 *
 * Caller note (desktop): `processMentions` here always tokenizes. Desktop has a
 * caller-side guard that skips tokenization when no user-resolver is wired (to
 * avoid leaking raw tokens in lookup-less contexts). That guard lives in the
 * desktop wrapper, NOT in this pure function.
 */

import { hasWordBoundaries } from './mentions';
import { createIPFSCIDRegex } from './validation';
import type { SpaceMember, Role, Channel } from '../types';

export interface PreprocessOptions {
  members?: SpaceMember[];
  roles?: Role[];
  channels?: Channel[];
  /**
   * Whether this message's `@everyone` was authorized (mentions.everyone set AND
   * sender holds mention:everyone). When false, `@everyone` stays plain text.
   * The caller owns this decision; the pipeline only tokenizes.
   */
  everyoneAuthorized?: boolean;
}

// ---------------------------------------------------------------------------
// Protected-region helpers — never tokenize/auto-link inside code or existing
// markdown links.
// ---------------------------------------------------------------------------

interface Region {
  start: number;
  end: number;
}

/**
 * Find regions where mention/URL processing must be skipped: fenced code
 * (```...```), inline code (`...`), and existing markdown links [text](url) /
 * ![alt](url). Protecting markdown links here (not just inside processURLs)
 * means a mention sitting inside a link's text is left alone too — the
 * conservative, desktop-matching behavior.
 */
export function getProtectedRegions(text: string): Region[] {
  const regions: Region[] = [];

  // Fenced code blocks.
  const fenceRegex = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(text)) !== null) {
    regions.push({ start: m.index, end: m.index + m[0].length });
  }

  // Inline code — skip backticks that fall inside an already-found fence.
  const inlineRegex = /`[^`\n]+`/g;
  while ((m = inlineRegex.exec(text)) !== null) {
    const start = m.index;
    const insideFence = regions.some((r) => start >= r.start && start < r.end);
    if (!insideFence) {
      regions.push({ start, end: start + m[0].length });
    }
  }

  // Existing markdown links [text](url) and image links ![alt](url) — skip any
  // that fall inside a code region already found.
  const mdLinkRegex = /!?\[[^\]]*\]\([^)]*\)/g;
  while ((m = mdLinkRegex.exec(text)) !== null) {
    const start = m.index;
    const insideCode = regions.some((r) => start >= r.start && start < r.end);
    if (!insideCode) {
      regions.push({ start, end: start + m[0].length });
    }
  }

  return regions;
}

export function isInProtectedRegion(index: number, regions: Region[]): boolean {
  return regions.some((r) => index >= r.start && index < r.end);
}

// ---------------------------------------------------------------------------
// Mention / role / channel tokenization
// ---------------------------------------------------------------------------

/**
 * Convert `@everyone` and `@<address>` user mentions into internal tokens.
 * Also tolerates the legacy bare `@address` format already in storage from
 * older mobile clients (matched against the member map by display name / name /
 * address). The legacy shim only activates when `members` is non-empty, so it's
 * inert for desktop (which never produced bare-format mentions and passes none).
 *
 * @param everyoneAuthorized — only tokenize `@everyone` when the caller has
 *   confirmed authorization; an unauthorized/spoofed `@everyone` stays plain
 *   text, matching the notification trust rule.
 */
export function processMentions(
  text: string,
  members: SpaceMember[] = [],
  everyoneAuthorized = false,
): string {
  let processed = text;

  // @everyone → token (only when authorized).
  if (everyoneAuthorized) {
    const everyoneRegex = /@everyone\b/gi;
    const everyoneMatches = Array.from(processed.matchAll(everyoneRegex));
    const validEveryone = everyoneMatches.filter(
      (match) =>
        !isInProtectedRegion(match.index!, getProtectedRegions(processed)) &&
        hasWordBoundaries(processed, match),
    );
    for (let i = validEveryone.length - 1; i >= 0; i--) {
      const match = validEveryone[i];
      processed =
        processed.substring(0, match.index) +
        '<<<MENTION_EVERYONE>>>' +
        processed.substring(match.index! + match[0].length);
    }
  }

  // Canonical user mentions: @<address>
  const cidPattern = createIPFSCIDRegex().source;
  const userMentionRegex = new RegExp(`@<(${cidPattern})>`, 'g');
  const userMatches = Array.from(processed.matchAll(userMentionRegex));
  const validUsers = userMatches.filter(
    (match) =>
      hasWordBoundaries(processed, match) &&
      !isInProtectedRegion(match.index!, getProtectedRegions(processed)),
  );
  for (let i = validUsers.length - 1; i >= 0; i--) {
    const match = validUsers[i];
    const address = match[1];
    processed =
      processed.substring(0, match.index) +
      `<<<MENTION_USER:${address}>>>` +
      processed.substring(match.index! + match[0].length);
  }

  // Legacy bare @address (no brackets) — only convert when it resolves to a
  // known member, so ordinary "@word" text isn't accidentally tokenized.
  if (members.length > 0) {
    const memberByKey = buildMemberKeyMap(members);
    const bareRegex = /@([a-zA-Z0-9_.\-]+)/g;
    const bareMatches = Array.from(processed.matchAll(bareRegex));
    const validBare = bareMatches.filter((match) => {
      if (!hasWordBoundaries(processed, match)) return false;
      if (isInProtectedRegion(match.index!, getProtectedRegions(processed))) return false;
      return Boolean(memberByKey[match[1].toLowerCase()]);
    });
    for (let i = validBare.length - 1; i >= 0; i--) {
      const match = validBare[i];
      const member = memberByKey[match[1].toLowerCase()];
      processed =
        processed.substring(0, match.index) +
        `<<<MENTION_USER:${member.address}>>>` +
        processed.substring(match.index! + match[0].length);
    }
  }

  return processed;
}

/**
 * Convert role mentions into tokens. Resolves directly against the `roles`
 * array (no pre-extracted mention-id filter): identical `@roleTag` text renders
 * consistently regardless of how it was authored. A pill is only ever produced
 * for a role that actually exists in the array. Matches both `@<roleId>`
 * (canonical, angle-bracketed UUID) and bare `@roleTag` (human-typed / legacy).
 */
export function processRoleMentions(text: string, roles: Role[] = []): string {
  if (roles.length === 0) return text;

  let processed = text;

  // @<roleId> — canonical. roleId is a UUID, angle-bracket wrapped.
  roles.forEach((role) => {
    const escapedId = escapeRegex(role.roleId);
    const regex = new RegExp(`@<${escapedId}>`, 'g');
    const matches = Array.from(processed.matchAll(regex));
    const valid = matches.filter(
      (match) =>
        !isInProtectedRegion(match.index!, getProtectedRegions(processed)) &&
        hasWordBoundaries(processed, match),
    );
    for (let i = valid.length - 1; i >= 0; i--) {
      const match = valid[i];
      processed =
        processed.substring(0, match.index) +
        `<<<MENTION_ROLE:${role.roleTag}:${role.displayName}>>>` +
        processed.substring(match.index! + match[0].length);
    }
  });

  // @roleTag — legacy / human-typed. Match the exact tag, word-bounded.
  roles.forEach((role) => {
    const escapedTag = escapeRegex(role.roleTag);
    const regex = new RegExp(`@${escapedTag}(?!\\w)`, 'g');
    const matches = Array.from(processed.matchAll(regex));
    const valid = matches.filter(
      (match) =>
        !isInProtectedRegion(match.index!, getProtectedRegions(processed)) &&
        hasWordBoundaries(processed, match),
    );
    for (let i = valid.length - 1; i >= 0; i--) {
      const match = valid[i];
      processed =
        processed.substring(0, match.index) +
        `<<<MENTION_ROLE:${role.roleTag}:${role.displayName}>>>` +
        processed.substring(match.index! + match[0].length);
    }
  });

  return processed;
}

/**
 * Convert `#<channelId>` channel mentions into tokens, resolved directly
 * against the `channels` array (no pre-extracted mention-id filter — same
 * rationale as processRoleMentions).
 */
export function processChannelMentions(text: string, channels: Channel[] = []): string {
  if (channels.length === 0) return text;

  let processed = text;
  channels.forEach((channel) => {
    const escapedId = escapeRegex(channel.channelId);
    const regex = new RegExp(`#<${escapedId}>`, 'g');
    const matches = Array.from(processed.matchAll(regex));
    const valid = matches.filter(
      (match) =>
        !isInProtectedRegion(match.index!, getProtectedRegions(processed)) &&
        hasWordBoundaries(processed, match),
    );
    for (let i = valid.length - 1; i >= 0; i--) {
      const match = valid[i];
      processed =
        processed.substring(0, match.index) +
        `<<<MENTION_CHANNEL:${channel.channelId}:${channel.channelName}>>>` +
        processed.substring(match.index! + match[0].length);
    }
  });

  return processed;
}

// ---------------------------------------------------------------------------
// URL / header / code-fence normalization
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

/**
 * Convert bare URLs to `[url](url)` markdown links, skipping code regions,
 * existing markdown links, and `<URL>` angle-bracket autolinks (which are
 * already links and must not be wrapped again).
 */
export function processURLs(text: string): string {
  const protectedRegions = getProtectedRegions(text);

  const matches: Array<{ start: number; end: number; url: string }> = [];
  URL_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    if (!isInProtectedRegion(m.index, protectedRegions)) {
      matches.push({ start: m.index, end: m.index + m[0].length, url: m[0] });
    }
  }

  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, url } = matches[i];
    const before = result.substring(0, start);
    const after = result.substring(end);
    // Skip URLs already wrapped as a <URL> angle-bracket autolink.
    if (before.endsWith('<') && after.startsWith('>')) {
      continue;
    }
    result = before + `[${url}](${url})` + after;
  }
  return result;
}

/**
 * Rewrite `#`/`##` headers to `###` (the renderer only supports one header
 * level). Headers of 3+ hashes are left alone. Code blocks are protected via
 * placeholders so a `#` inside a fence is never rewritten.
 */
export function convertHeadersToH3(text: string): string {
  const codeBlocks: string[] = [];
  const withPlaceholders = text.replace(/```[\s\S]*?```/g, (block) => {
    codeBlocks.push(block);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // ## or # at line start (but not ###+). Single pass.
  const converted = withPlaceholders.replace(/^(#{1,2})(?!#)(\s+)/gm, '###$2');

  return converted.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[Number(idx)]);
}

/**
 * Append a closing fence if the message has an odd number of ``` delimiters,
 * so an unclosed code block still renders as a code block.
 */
export function fixUnclosedCodeBlocks(text: string): string {
  const parts = text.split('```');
  if (parts.length % 2 === 0) {
    const lastPart = parts[parts.length - 1];
    return text + (lastPart.endsWith('\n') ? '```' : '\n```');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Orchestrator + markdown detection (mobile uses these; desktop calls the
// individual functions above in its own interleaved order instead)
// ---------------------------------------------------------------------------

/**
 * Run the full preprocessing pipeline. Order: newline-normalize → mentions →
 * roles → channels → URLs → headers → fences. Returns text ready for the
 * markdown renderer.
 *
 * NOTE: desktop does NOT call this — it interleaves desktop-only steps
 * (invite links, standalone YouTube, message links) with these and must run
 * message-link processing before URL auto-linking. Desktop calls the individual
 * functions; only mobile uses this orchestrator.
 */
export function prepareMessageContent(text: string, opts: PreprocessOptions = {}): string {
  // Normalize newlines first. Pasted text can carry `\r\n` or bare `\r`; a
  // per-line block parser that matches `^…$` breaks on a stray `\r`. Collapse
  // everything to `\n`. (Desktop renders via react-markdown and skips this by
  // calling the individual functions, not this orchestrator.)
  let processed = text.replace(/\r\n?/g, '\n');
  processed = processMentions(processed, opts.members, opts.everyoneAuthorized);
  processed = processRoleMentions(processed, opts.roles);
  processed = processChannelMentions(processed, opts.channels);
  processed = processURLs(processed);
  processed = convertHeadersToH3(processed);
  processed = fixUnclosedCodeBlocks(processed);
  return processed;
}

// Block/inline markdown syntax that warrants the full markdown renderer. Bare
// URLs, plain `@mentions`, `#channels` and `:emoji:` do NOT count — those are
// handled by a cheaper inline path, so a normal chat line never pays the
// markdown cost.
const MARKDOWN_SYNTAX_REGEX = new RegExp(
  [
    '\\*\\*[^*]+\\*\\*', // **bold**
    '__[^_]+__', // __bold__
    '(?:^|[^*])\\*[^*\\s][^*]*\\*', // *italic*
    '(?:^|[^_])_[^_\\s][^_]*_', // _italic_
    '~~[^~]+~~', // ~~strikethrough~~
    '`[^`]+`', // `inline code`
    '```', // fenced code
    '\\|\\|[^|]+\\|\\|', // ||spoiler||
    '^#{1,6}\\s', // # heading
    '^>\\s', // > blockquote
    '^[-*+]\\s', // - list item
    '^\\d+\\.\\s', // 1. ordered list
    '^---+$', // --- thematic break
  ].join('|'),
  'm',
);

/**
 * Cheap test for whether `text` contains any markdown that requires the full
 * renderer. Messages with none can route through a lighter inline path.
 */
export function hasMarkdown(text: string): boolean {
  if (!text) return false;
  return MARKDOWN_SYNTAX_REGEX.test(text);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMemberKeyMap(members: SpaceMember[]): Record<string, SpaceMember> {
  const map: Record<string, SpaceMember> = {};
  members.forEach((m) => {
    if (m.display_name) map[m.display_name.toLowerCase()] = m;
    if (m.name) map[m.name.toLowerCase()] = m;
    if (m.address) map[m.address.toLowerCase()] = m;
  });
  return map;
}
