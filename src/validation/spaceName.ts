/**
 * Space name validation.
 *
 * Rules (aligned to mobile 2026-05-28):
 * - Required (non-empty after trim)
 * - Minimum length: MIN_NAME_LENGTH
 * - Maximum length: MAX_NAME_LENGTH
 * - No dangerous HTML patterns (XSS defense-in-depth)
 */

import { MAX_NAME_LENGTH, MIN_NAME_LENGTH, validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

export function validateSpaceName(spaceName: string): FieldValidationResult {
  const trimmed = spaceName.trim();
  if (!trimmed) {
    return { ok: false, errorKey: 'spaceName.required' };
  }
  if (trimmed.length < MIN_NAME_LENGTH) {
    return {
      ok: false,
      errorKey: 'spaceName.tooShort',
      errorVars: { min: MIN_NAME_LENGTH },
    };
  }
  if (spaceName.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      errorKey: 'spaceName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    };
  }
  if (!validateNameForXSS(spaceName)) {
    return { ok: false, errorKey: 'spaceName.invalidChars' };
  }
  return { ok: true };
}
