/**
 * Device name validation.
 *
 * Rules:
 * - Required (non-empty after trim)
 * - Maximum length: MAX_NAME_LENGTH
 * - No dangerous HTML patterns (XSS defense-in-depth)
 * - Restricted character set: unicode letters, unicode digits, spaces, hyphens, parentheses, apostrophes
 */

import { MAX_NAME_LENGTH, validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

// Allowed: unicode letters, unicode digits, spaces, hyphens, parentheses, apostrophes
export const DEVICE_NAME_PATTERN = /^[\p{L}\p{N} \-()']+$/u;

export function validateDeviceName(name: string): FieldValidationResult {
  if (!name.trim()) {
    return { ok: false, errorKey: 'deviceName.required' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      errorKey: 'deviceName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    };
  }
  if (!validateNameForXSS(name)) {
    return { ok: false, errorKey: 'deviceName.invalidChars' };
  }
  if (!DEVICE_NAME_PATTERN.test(name)) {
    return { ok: false, errorKey: 'deviceName.invalidCharset' };
  }
  return { ok: true };
}
