/**
 * Channel topic validation.
 *
 * Rules:
 * - Optional (empty is valid)
 * - Maximum length: MAX_TOPIC_LENGTH
 * - No dangerous HTML patterns when non-empty (XSS defense-in-depth)
 */

import { MAX_TOPIC_LENGTH, validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

export function validateChannelTopic(channelTopic: string): FieldValidationResult {
  if (channelTopic.length > MAX_TOPIC_LENGTH) {
    return {
      ok: false,
      errorKey: 'channelTopic.tooLong',
      errorVars: { max: MAX_TOPIC_LENGTH },
    };
  }
  if (channelTopic && !validateNameForXSS(channelTopic)) {
    return { ok: false, errorKey: 'channelTopic.invalidChars' };
  }
  return { ok: true };
}
