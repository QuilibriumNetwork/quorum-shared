/**
 * Notification Settings Utilities
 *
 * Helper functions for managing notification preferences (mentions and replies).
 */

import type {
  SpaceNotificationSettings,
  SpaceNotificationTypeId,
} from '../types/notifications';

/**
 * Get default notification settings for a space
 * By default, all notification types are enabled (mentions and replies)
 *
 * @param spaceId - The space ID to create settings for
 * @returns Default settings with all notification types enabled
 */
export function getDefaultNotificationSettings(
  spaceId: string
): SpaceNotificationSettings {
  return {
    spaceId,
    enabledNotificationTypes: ['mention-you', 'mention-everyone', 'mention-roles', 'reply'],
  };
}

/**
 * Fill in a partially-written per-space settings record.
 *
 * `SpaceNotificationSettings` declares `enabledNotificationTypes` as required,
 * but the value reaches us from an untyped synced config blob, so the type is a
 * claim about what SHOULD be there rather than a guarantee. A record that exists
 * but omits the array is a real shape on real accounts: quorum-mobile's
 * per-space mute writer persists `{ ...(prev[spaceId] ?? {}), isMuted }`, which
 * for a space with no prior settings yields `{ isMuted }` and nothing else. That
 * record then syncs to every other device.
 *
 * A plain `?? getDefaultNotificationSettings(...)` does NOT cover this: the
 * record is truthy, so the fallback never fires and the missing array surfaces
 * as `undefined` at the first `.filter`/`.includes`/`.length` — which crashed
 * the channel route via NotificationPanel.
 *
 * READ-SIDE ONLY, on purpose. Do not use this to "repair" a partial record by
 * writing the normalized value back. That was implemented and reverted: the
 * completed value asserts the all-enabled DEFAULT, which is not a selection the
 * user made, and config sync is last-write-wins across the whole blob. A repair
 * write therefore races any real selection made on another device that has not
 * synced down yet, and silently reverts it — reopening the data-loss bug that
 * desktop's 2026-06-23 clobber guard exists to prevent. A partial record is
 * inert as long as every reader normalizes, and it converges by itself the first
 * time the user genuinely changes a selection anywhere.
 *
 * @param spaceId - The space these settings belong to
 * @param stored - The record as read from config (possibly partial/absent)
 * @returns A complete settings object; caller-supplied fields always win
 */
export function normalizeSpaceNotificationSettings(
  spaceId: string,
  stored: Partial<SpaceNotificationSettings> | undefined | null
): SpaceNotificationSettings {
  const defaults = getDefaultNotificationSettings(spaceId);
  if (!stored) return defaults;

  return {
    ...stored,
    spaceId: stored.spaceId || spaceId,
    enabledNotificationTypes: Array.isArray(stored.enabledNotificationTypes)
      ? stored.enabledNotificationTypes
      : defaults.enabledNotificationTypes,
  };
}

/**
 * Check if a specific notification type is enabled in settings
 *
 * @param settings - The notification settings
 * @param notificationType - The notification type to check
 * @returns true if the notification type is enabled
 */
export function isNotificationTypeEnabled(
  settings: SpaceNotificationSettings | undefined,
  notificationType: SpaceNotificationTypeId
): boolean {
  // A record missing the array is treated exactly like no record at all:
  // all types enabled. See normalizeSpaceNotificationSettings for why the
  // declared-required field can be absent at runtime.
  if (!settings || !Array.isArray(settings.enabledNotificationTypes)) {
    // Default: all types enabled
    return true;
  }

  return settings.enabledNotificationTypes.includes(notificationType);
}

/**
 * Check if any notification types are enabled
 *
 * @param settings - The notification settings
 * @returns true if at least one notification type is enabled
 */
export function hasEnabledNotificationTypes(
  settings: SpaceNotificationSettings | undefined
): boolean {
  if (!settings || !Array.isArray(settings.enabledNotificationTypes)) {
    // Default: all types enabled
    return true;
  }

  return settings.enabledNotificationTypes.length > 0;
}
