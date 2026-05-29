/**
 * Space description validation.
 *
 * Accepts a caller-supplied max length (the caller decides whether this is
 * a short topic, a longer description, etc.).
 */

import { validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

export function validateSpaceDescription(
  description: string,
  maxLength: number
): FieldValidationResult[] {
  const errors: FieldValidationResult[] = [];

  if (!validateNameForXSS(description)) {
    errors.push({ ok: false, errorKey: 'spaceDescription.invalidChars' });
  }
  if (description.length > maxLength) {
    errors.push({
      ok: false,
      errorKey: 'spaceDescription.tooLong',
      errorVars: { max: maxLength },
    });
  }

  return errors;
}
