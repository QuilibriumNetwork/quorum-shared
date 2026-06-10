/**
 * Display name validation.
 *
 * Rules (verified against mobile + pre-refactor desktop, 2026-05-28):
 * - Required (non-empty after trim)
 * - Maximum length: MAX_DISPLAY_NAME_BYTES (32 UTF-8 bytes, no minimum —
 *   mobile has no validation on display names at all; pre-refactor desktop
 *   only required non-empty). The limit is in BYTES, not characters, to match
 *   Farcaster's USER_DATA_TYPE_DISPLAY constraint (<= 32 bytes): a Quorum
 *   profile can be published to Farcaster, so a name Farcaster would reject
 *   must be rejected here too. We count bytes because one emoji is up to 4
 *   bytes and an accented letter is 2 — a character count would let through
 *   names the Farcaster relay then rejects on publish.
 * - No mention-reserved names (everyone, here, mod, manager)
 * - No impersonation names (admin, moderator, etc., including homoglyph variants)
 * - No ".q" suffix (reserved for verified QNS names; a name ending in ".q"
 *   would spoof the verified-name marker — a mid-name dot like "jane.doe" is
 *   fine since it can't look like a verified handle)
 * - No dangerous HTML patterns (XSS defense-in-depth)
 */

import {
  byteLength,
  validateNameForXSS,
  getReservedNameType,
} from '../utils/validation';
import type { FieldValidationResult } from './result';

/**
 * Maximum display name length in UTF-8 bytes.
 * Matches Farcaster's USER_DATA_TYPE_DISPLAY limit (<= 32 bytes) so a Quorum
 * display name is always accepted when published to a merged Farcaster profile.
 */
export const MAX_DISPLAY_NAME_BYTES = 32;

export function validateDisplayName(displayName: string): FieldValidationResult {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return { ok: false, errorKey: 'displayName.required' };
  }
  if (byteLength(trimmed) > MAX_DISPLAY_NAME_BYTES) {
    return { ok: false, errorKey: 'displayName.tooLong' };
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
