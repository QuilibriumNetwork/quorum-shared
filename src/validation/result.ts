/**
 * Shared validation result type.
 *
 * Validators return a structured result with a stable error code (`errorKey`)
 * and optional interpolation variables. Platforms (desktop with Lingui,
 * mobile with hardcoded strings or its own i18n later) own thin wrappers
 * that map `errorKey` to displayed text.
 *
 * See `.agents/tasks/quorum-shared-migration/2026-05-28-cross-repo-workflow.md`
 * section "i18n in shared" for the full rule and rationale.
 */

export type FieldValidationOk = { ok: true };

export type FieldValidationErr = {
  ok: false;
  errorKey: string;
  errorVars?: Record<string, string | number>;
};

export type FieldValidationResult = FieldValidationOk | FieldValidationErr;

/**
 * Helper for callers (and platform wrappers) that just want a boolean.
 */
export function isValidField(result: FieldValidationResult): result is FieldValidationOk {
  return result.ok;
}
