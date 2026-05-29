/**
 * Cross-platform validators.
 *
 * Each validator returns a `ValidationResult` (or `ValidationResult[]` for
 * multi-violation checks like bio/description). Platform consumers wrap
 * with thin i18n adapters that map `errorKey` to displayed strings.
 *
 * See `.agents/tasks/quorum-shared-migration/2026-05-28-cross-repo-workflow.md`
 * section "i18n in shared" for the rule + worked examples.
 */

export type {
  FieldValidationOk,
  FieldValidationErr,
  FieldValidationResult,
} from './result';
export { isValidField } from './result';

export { validateSpaceName } from './spaceName';
export { validateSpaceDescription } from './spaceDescription';
export { validateDisplayName } from './displayName';
export { validateChannelName } from './channelName';
export { validateChannelTopic } from './channelTopic';
export { validateGroupName } from './groupName';
export { validateDeviceName, DEVICE_NAME_PATTERN } from './deviceName';
export { validateUserBio, MAX_BIO_LENGTH } from './userBio';
export { validateUserNote, MAX_USER_NOTE_LENGTH } from './userNote';
