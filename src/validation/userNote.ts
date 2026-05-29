/**
 * User note validation.
 *
 * Notes are private and never rendered as HTML — we only block actual
 * script injection patterns rather than running the full XSS check.
 */

import type { FieldValidationResult } from './result';

export const MAX_USER_NOTE_LENGTH = 256;

const SCRIPT_INJECTION_PATTERN = /<script|<\/script|javascript:/i;

export function validateUserNote(note: string): FieldValidationResult[] {
  const errors: FieldValidationResult[] = [];

  if (SCRIPT_INJECTION_PATTERN.test(note)) {
    errors.push({ ok: false, errorKey: 'userNote.invalidContent' });
  }
  if (note.length > MAX_USER_NOTE_LENGTH) {
    errors.push({
      ok: false,
      errorKey: 'userNote.tooLong',
      errorVars: { max: MAX_USER_NOTE_LENGTH },
    });
  }

  return errors;
}
