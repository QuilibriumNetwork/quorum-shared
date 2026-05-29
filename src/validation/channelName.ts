/**
 * Channel name validation.
 *
 * Rules:
 * - Required (non-empty after trim)
 * - Maximum length: MAX_NAME_LENGTH
 * - No dangerous HTML patterns (XSS defense-in-depth)
 *
 * Channels do not enforce MIN_NAME_LENGTH today (single-character channels
 * like "#1" or emoji-prefixed names should remain valid).
 */

import { MAX_NAME_LENGTH, validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

export function validateChannelName(channelName: string): FieldValidationResult {
  if (!channelName.trim()) {
    return { ok: false, errorKey: 'channelName.required' };
  }
  if (channelName.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      errorKey: 'channelName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    };
  }
  if (!validateNameForXSS(channelName)) {
    return { ok: false, errorKey: 'channelName.invalidChars' };
  }
  return { ok: true };
}
