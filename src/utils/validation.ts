/**
 * Message validation utilities
 */

import type { Message, PostMessage } from '../types';

/** Maximum message length */
export const MAX_MESSAGE_LENGTH = 4000;

/** Maximum number of mentions per message */
export const MAX_MENTIONS = 50;

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate message content before sending
 */
export function validateMessageContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    errors.push('Message cannot be empty');
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    errors.push(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a message object
 */
export function validateMessage(message: Partial<Message>): ValidationResult {
  const errors: string[] = [];

  if (!message.messageId) {
    errors.push('Message ID is required');
  }

  if (!message.channelId) {
    errors.push('Channel ID is required');
  }

  if (!message.spaceId) {
    errors.push('Space ID is required');
  }

  if (!message.content) {
    errors.push('Message content is required');
  }

  if (message.content?.type === 'post') {
    const postContent = message.content as PostMessage;
    const text = Array.isArray(postContent.text)
      ? postContent.text.join('')
      : postContent.text;

    if (text.length > MAX_MESSAGE_LENGTH) {
      errors.push(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize message content for display
 */
export function sanitizeContent(content: string): string {
  // Remove null bytes and control characters (except newlines/tabs)
  return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
