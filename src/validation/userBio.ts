/**
 * User bio validation.
 *
 * Returns a list of errors (a bio can fail multiple checks; we don't
 * short-circuit on the first failure because the form may want to show
 * all violations).
 */

import { validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

/**
 * Maximum length for user bio/description.
 * Matches mobile app limit for consistency.
 */
export const MAX_BIO_LENGTH = 160;

export function validateUserBio(bio: string): FieldValidationResult[] {
  const errors: FieldValidationResult[] = [];

  if (!validateNameForXSS(bio)) {
    errors.push({ ok: false, errorKey: 'userBio.invalidChars' });
  }
  if (bio.length > MAX_BIO_LENGTH) {
    errors.push({
      ok: false,
      errorKey: 'userBio.tooLong',
      errorVars: { max: MAX_BIO_LENGTH },
    });
  }

  return errors;
}
