import { logger } from './logger';

/**
 * Native (React Native) version of markdownStripping.
 *
 * Uses regex-based stripping instead of unified/remark which are ESM-only
 * packages incompatible with Metro/Hermes.
 */

/**
 * Strips markdown formatting from text using regex (no unified dependency).
 * Less precise than the web version but sufficient for mobile use cases
 * (notifications, previews, search).
 */
export function stripMarkdown(text: string): string {
  try {
    let processed = text
      // Remove YouTube embeds and invite cards
      .replace(/!\[youtube-embed\]\([^)]+\)/g, '')
      .replace(/!\[invite-card\]\([^)]+\)/g, '')
      // Headers: ### Title → Title
      .replace(/^#{1,6}\s+(.+)$/gm, '$1')
      // Bold: **text** → text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      // Italic: *text* → text
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // Strikethrough: ~~text~~ → text
      .replace(/~~(.+?)~~/g, '$1')
      // Code blocks: ```lang\ncode\n``` → code
      .replace(/```[\s\S]*?\n([\s\S]*?)\n```/g, '$1')
      .replace(/```(.+?)```/g, '$1')
      // Inline code: `code` → code
      .replace(/`(.+?)`/g, '$1')
      // Links: [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Images: ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Blockquotes: > text → text
      .replace(/^>\s+/gm, '')
      // Lists: - item → item, 1. item → item
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Horizontal rules: --- → (remove)
      .replace(/^[-*_]{3,}$/gm, '');

    return processed.trim();
  } catch (error) {
    logger.warn('Failed to strip markdown:', error);
    return text;
  }
}

/**
 * Flexible markdown processing options for different contexts
 */
interface MarkdownProcessingOptions {
  removeMentions?: boolean;
  removeFormatting?: boolean;
  removeStructure?: boolean;
  preserveLineBreaks?: boolean;
  preserveEmphasis?: boolean;
  preserveHeaders?: boolean;
  truncateLength?: number;
  replaceMentionsWithNames?: boolean;
  mapSenderToUser?: (senderId: string) => { displayName?: string } | undefined;
}

/**
 * Unified markdown text processing utility (native version).
 * Same API as the web version but uses regex-based stripping.
 */
export function processMarkdownText(text: string, options: MarkdownProcessingOptions = {}): string {
  if (!text) return '';

  const {
    removeMentions = false,
    removeFormatting = true,
    removeStructure = false,
    preserveLineBreaks = true,
    preserveEmphasis = true,
    preserveHeaders = true,
    truncateLength,
    replaceMentionsWithNames = false,
    mapSenderToUser
  } = options;

  let processed = text;

  // Step 1: Handle mentions first
  if (replaceMentionsWithNames && mapSenderToUser) {
    processed = processed.replace(/@<(Qm[a-zA-Z0-9]+)>/g, (_match, address) => {
      const user = mapSenderToUser(address);
      const displayName = user?.displayName || address.substring(0, 8) + '...';
      return `@${displayName}`;
    });
  } else if (removeMentions) {
    processed = processed
      .replace(/@<Qm[a-zA-Z0-9]+>/g, '')
      .replace(/@everyone\b/gi, '')
      .replace(/@\w+/g, '')
      .replace(/#<[^>]+>/g, '')
      .replace(/<<<MENTION_USER:[^>]+>>>/g, '')
      .replace(/<<<MENTION_EVERYONE>>>/g, '')
      .replace(/<<<MENTION_ROLE:[^>]+>>>/g, '')
      .replace(/<<<MENTION_CHANNEL:[^>]+>>>/g, '');
  }

  // Step 2: Handle markdown formatting
  if (removeFormatting) {
    if (preserveHeaders && preserveEmphasis) {
      processed = processed
        .replace(/^#{1,6}\s+(.+)$/gm, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/```[\s\S]*?\n([\s\S]*?)\n```/g, '$1')
        .replace(/```(.+?)```/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^>\s+/gm, '')
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        .replace(/^[-*_]{3,}$/gm, '');
    } else {
      processed = stripMarkdown(processed);
    }
  }

  // Step 3: Handle structure
  if (removeStructure) {
    processed = processed.replace(/\s+/g, ' ').trim();
  } else if (preserveLineBreaks) {
    processed = processed
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ +/g, ' ')
      .trim();
  }

  // Step 4: Apply truncation
  if (truncateLength && processed.length > truncateLength) {
    processed = processed
      .substring(0, truncateLength)
      .replace(/\s+\S*$/, '...');
  }

  return processed;
}

/**
 * Strips markdown formatting AND all mention patterns.
 * @deprecated Use processMarkdownText() with appropriate options
 */
export function stripMarkdownAndMentions(text: string): string {
  return processMarkdownText(text, {
    removeMentions: true,
    removeStructure: true,
    preserveLineBreaks: false,
    preserveEmphasis: false
  });
}

/**
 * Replaces user mention addresses with display names in plain text.
 */
export function replaceMentionsWithDisplayNames(
  text: string,
  mapSenderToUser: (senderId: string) => { displayName?: string } | undefined
): string {
  if (!text) return '';

  return text.replace(/@<(Qm[a-zA-Z0-9]+)>/g, (_match, address) => {
    const user = mapSenderToUser(address);
    const displayName = user?.displayName || address.substring(0, 8) + '...';
    return `@${displayName}`;
  });
}
