/**
 * User bio validation.
 *
 * Returns a list of errors (a bio can fail multiple checks; we don't
 * short-circuit on the first failure because the form may want to show
 * all violations).
 */

import { byteLength, validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

/**
 * Maximum bio length in UTF-8 bytes.
 * Matches Farcaster's USER_DATA_TYPE_BIO limit (<= 256 bytes) so a Quorum bio
 * is always accepted when published to a merged Farcaster profile. Counted in
 * bytes, not characters, because one emoji is up to 4 bytes and an accented
 * letter is 2 — a character count would pass bios the Farcaster relay rejects.
 */
export const MAX_BIO_BYTES = 256;

export function validateUserBio(bio: string): FieldValidationResult[] {
  const errors: FieldValidationResult[] = [];

  if (!validateNameForXSS(bio)) {
    errors.push({ ok: false, errorKey: 'userBio.invalidChars' });
  }
  if (byteLength(bio) > MAX_BIO_BYTES) {
    errors.push({ ok: false, errorKey: 'userBio.tooLong' });
  }

  return errors;
}
