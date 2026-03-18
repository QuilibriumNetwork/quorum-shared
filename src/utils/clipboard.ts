import type { Message as MessageType, PostMessage, EmbedMessage, StickerMessage } from '../types';

/**
 * Extracts raw text content from different message types for copying to clipboard.
 * Preserves original formatting including markdown syntax.
 *
 * @param message - The message object containing content
 * @returns The raw text content suitable for copying
 */
export function extractMessageRawText(message: MessageType): string {
  const content = message.content;

  switch (content.type) {
    case 'post': {
      const postContent = content as PostMessage;
      // Handle both string and string array formats
      if (Array.isArray(postContent.text)) {
        return postContent.text.join('\n');
      }
      return postContent.text || '';
    }

    case 'embed': {
      const embedContent = content as EmbedMessage;
      // Currently only images are supported in the app
      if (embedContent.imageUrl) {
        return '[Image]';
      }
      // Future: Add support for other media types when implemented
      return '[Media]';
    }

    case 'sticker': {
      const stickerContent = content as StickerMessage;
      return `[Sticker: ${stickerContent.stickerId}]`;
    }

    // Fallback for any unexpected cases
    default:
      return '[Message content not copyable]';
  }
}
