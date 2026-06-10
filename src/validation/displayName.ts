/**
 * Display name validation.
 *
 * Rules (verified against mobile + pre-refactor desktop, 2026-05-28):
 * - Required (non-empty after trim)
 * - Maximum length: MAX_NAME_LENGTH (no minimum — mobile has no validation
 *   on display names at all; pre-refactor desktop only required non-empty)
 * - No mention-reserved names (everyone, here, mod, manager)
 * - No impersonation names (admin, moderator, etc., including homoglyph variants)
 * - No ".q" suffix (reserved for verified QNS names; a name ending in ".q"
 *   would spoof the verified-name marker — a mid-name dot like "jane.doe" is
 *   fine since it can't look like a verified handle)
 * - No dangerous HTML patterns (XSS defense-in-depth)
 */

import {
  MAX_NAME_LENGTH,
  validateNameForXSS,
  getReservedNameType,
} from '../utils/validation';
import type { FieldValidationResult } from './result';

export function validateDisplayName(displayName: string): FieldValidationResult {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return { ok: false, errorKey: 'displayName.required' };
  }
  if (displayName.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      errorKey: 'displayName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    };
  }
  const reservedType = getReservedNameType(displayName);
  if (reservedType === 'qns-suffix') {
    return { ok: false, errorKey: 'displayName.reservedQnsSuffix' };
  }
  if (reservedType === 'mention') {
    return { ok: false, errorKey: 'displayName.reservedMention' };
  }
  if (reservedType === 'impersonation') {
    return { ok: false, errorKey: 'displayName.reservedImpersonation' };
  }
  if (!validateNameForXSS(displayName)) {
    return { ok: false, errorKey: 'displayName.invalidChars' };
  }
  return { ok: true };
}
