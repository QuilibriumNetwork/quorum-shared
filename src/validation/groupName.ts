/**
 * Group name validation.
 *
 * Same shape as channel name — required, length-capped, XSS-safe.
 */

import { MAX_NAME_LENGTH, validateNameForXSS } from '../utils/validation';
import type { FieldValidationResult } from './result';

export function validateGroupName(groupName: string): FieldValidationResult {
  if (!groupName.trim()) {
    return { ok: false, errorKey: 'groupName.required' };
  }
  if (groupName.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      errorKey: 'groupName.tooLong',
      errorVars: { max: MAX_NAME_LENGTH },
    };
  }
  if (!validateNameForXSS(groupName)) {
    return { ok: false, errorKey: 'groupName.invalidChars' };
  }
  return { ok: true };
}
