/**
 * Notification Settings Types
 *
 * Defines types for user-configurable notification preferences (mentions and replies).
 */

import type { Message } from './message';

/**
 * Types of notifications that can be enabled/disabled
 * - 'mention-you': Direct @user mentions
 * - 'mention-everyone': @everyone mentions
 * - 'mention-roles': @role mentions
 * - 'reply': Replies to user's messages
 */
export type NotificationTypeId = 'mention-you' | 'mention-everyone' | 'mention-roles' | 'reply';

/**
 * Per-space notification settings
 * Stored in IndexedDB user_config.notificationSettings[spaceId]
 *
 * NOTE: This is distinct from the simpler NotificationSettings in user.ts,
 * which is used for the legacy notification toggle in UserConfig.
 */
export interface SpaceNotificationSettings {
  /** The space ID these settings apply to */
  spaceId: string;

  /** Array of enabled notification types (e.g., ['mention-you', 'mention-everyone', 'reply']) */
  enabledNotificationTypes: NotificationTypeId[];

  /** When true, suppresses ALL notifications for this space (mutes entire space) */
  isMuted?: boolean;
}

/**
 * Option for the notification settings multiselect dropdown
 */
export interface NotificationSettingOption {
  value: NotificationTypeId;
  label: string;
  subtitle: string;
  disabled?: boolean;
}

/**
 * Reply notification type (for combining with mention notifications in UI)
 */
export interface ReplyNotification {
  message: Message;
  channelId: string;
  channelName: string;
  type: 'reply';
}
