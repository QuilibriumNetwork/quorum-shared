/**
 * Mention parsing utilities
 */

import type { Mentions } from '../types';

/** Mention patterns */
export const MENTION_PATTERNS = {
  user: /<@([a-zA-Z0-9]+)>/g,
  role: /<@&([a-zA-Z0-9]+)>/g,
  channel: /<#([a-zA-Z0-9]+)>/g,
  everyone: /@everyone/g,
  here: /@here/g,
};

/** Parsed mention */
export interface ParsedMention {
  type: 'user' | 'role' | 'channel' | 'everyone' | 'here';
  id?: string;
  raw: string;
  start: number;
  end: number;
}

/**
 * Parse mentions from message text
 */
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];

  // Parse user mentions
  let match: RegExpExecArray | null;
  const userRegex = new RegExp(MENTION_PATTERNS.user.source, 'g');
  while ((match = userRegex.exec(text)) !== null) {
    mentions.push({
      type: 'user',
      id: match[1],
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Parse role mentions
  const roleRegex = new RegExp(MENTION_PATTERNS.role.source, 'g');
  while ((match = roleRegex.exec(text)) !== null) {
    mentions.push({
      type: 'role',
      id: match[1],
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Parse channel mentions
  const channelRegex = new RegExp(MENTION_PATTERNS.channel.source, 'g');
  while ((match = channelRegex.exec(text)) !== null) {
    mentions.push({
      type: 'channel',
      id: match[1],
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Parse @everyone
  const everyoneRegex = new RegExp(MENTION_PATTERNS.everyone.source, 'g');
  while ((match = everyoneRegex.exec(text)) !== null) {
    mentions.push({
      type: 'everyone',
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Parse @here
  const hereRegex = new RegExp(MENTION_PATTERNS.here.source, 'g');
  while ((match = hereRegex.exec(text)) !== null) {
    mentions.push({
      type: 'here',
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Sort by position
  return mentions.sort((a, b) => a.start - b.start);
}

/**
 * Extract Mentions object from parsed mentions
 */
export function extractMentions(text: string): Mentions {
  const parsed = parseMentions(text);

  const memberIds = parsed
    .filter((m) => m.type === 'user' && m.id)
    .map((m) => m.id!);

  const roleIds = parsed
    .filter((m) => m.type === 'role' && m.id)
    .map((m) => m.id!);

  const channelIds = parsed
    .filter((m) => m.type === 'channel' && m.id)
    .map((m) => m.id!);

  const everyone = parsed.some((m) => m.type === 'everyone' || m.type === 'here');

  return {
    memberIds: [...new Set(memberIds)],
    roleIds: [...new Set(roleIds)],
    channelIds: [...new Set(channelIds)],
    everyone,
    totalMentionCount: memberIds.length + roleIds.length + channelIds.length,
  };
}

/**
 * Format mention for display
 */
export function formatMention(type: 'user' | 'role' | 'channel', id: string): string {
  switch (type) {
    case 'user':
      return `<@${id}>`;
    case 'role':
      return `<@&${id}>`;
    case 'channel':
      return `<#${id}>`;
  }
}
