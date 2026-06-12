import { logger } from '../../utils';
import type { IconName, IconVariant } from './types';

/**
 * Icon-picker vocabulary — the curated list of icons, named color palette, and
 * filled-variant set offered by the channel/group icon picker.
 *
 * This is shared so desktop and mobile draw from one source of truth (same icons,
 * same named colors). The picker *components* live per-app; only this vocabulary +
 * its pure helpers are shared.
 *
 * Storage format note: `iconColor` is stored as a named enum value (e.g. 'blue'),
 * not raw hex. It's theme-aware — resolve to a hex at render time via
 * getIconColorHex() / getFolderColorHex(). Both platforms must write the named
 * value so cross-device icon colors stay consistent.
 */

export type IconColor =
  | 'default'
  | 'blue'
  | 'purple'
  | 'fuchsia'
  | 'green'
  | 'orange'
  | 'yellow'
  | 'red';

export interface IconOption {
  name: IconName;
  tier: number;
  category: string;
}

export interface ColorOption {
  value: IconColor;
  label: string;
  class: string;
  hex: string;
}

// Re-export IconVariant for picker consumers that import the vocabulary directly.
export type { IconVariant };

// Icons that have filled variants in the Tabler Icons library.
// These are shown when the "Filled" variant is selected. Every entry must have a
// real `${Component}Filled` in @tabler/icons-react and must also appear in
// ICON_OPTIONS (otherwise it's a dead entry).
export const FILLED_ICONS: Set<IconName> = new Set([
  'star',
  'heart',
  'home',
  'bell',
  'shield',
  'lock',
  'eye',
  'bookmark',
  'circle',
  'message', // IconMessageFilled
  'smile', // IconMoodSmileFilled
  'info-circle', // IconInfoCircleFilled
  'question-circle', // IconHelpCircleFilled
  'check-circle', // IconCircleCheckFilled
  'warning', // IconAlertTriangleFilled
  'gift', // IconGiftFilled
  'pin', // IconPinFilled
  'briefcase', // IconBriefcaseFilled
  'image', // IconPhotoFilled
  'video', // IconVideoFilled
  'microphone', // IconMicrophoneFilled
  'settings', // IconSettingsFilled
  'bug', // IconBugFilled
  'calendar-alt', // IconCalendarFilled
  'book', // IconBookFilled
  'paw', // IconPawFilled
  'headset', // IconHeadphonesFilled
  'palette', // IconPaletteFilled
  'flask', // IconFlaskFilled
  'fire', // IconFlameFilled
  'certificate', // IconRosetteDiscountCheckFilled
  'seedling', // IconSeedlingFilled
  'folder', // IconFolderFilled

  // Expanded set (2026-06-12)
  'sun', // IconSunFilled
  'moon', // IconMoonFilled
  'clock', // IconClockFilled
  'square', // IconSquareFilled
  'envelope', // IconMailFilled
  'messages', // IconMessagesFilled
  'mood-happy', // IconMoodHappyFilled
  'party', // IconConfettiFilled
  'phone', // IconPhoneFilled
  'user', // IconUserFilled
  'crown', // IconCrownFilled
  'key', // IconKeyFilled
  'shield-lock', // IconShieldLockFilled
  'camera', // IconCameraFilled
  'file', // IconFileFilled
  'player-play', // IconPlayerPlayFilled
  'desktop', // IconDeviceDesktopFilled
  'device-floppy', // IconDeviceFloppyFilled
  'badge', // IconBadgeFilled
  'file-code', // IconFileCodeFilled
  'flag', // IconFlagFilled
  'stack', // IconStack2Filled
  'ticket', // IconTicketFilled
  'trophy', // IconTrophyFilled
  'bolt', // IconBoltFilled
  'compass', // IconCompassFilled
  'map-pin', // IconMapPinFilled
  'sparkles', // IconSparklesFilled
]);

// Curated picker icons organized by tier and category.
// Expanded 2026-06-12: 49 -> 92. New names are all already renderable by the shared
// Icon primitive (no mapping work); slotted into existing tiers thematically.
export const ICON_OPTIONS: IconOption[] = [
  // Tier 1: Essential & Most Common (Top Row)
  { name: 'bullhorn', tier: 1, category: 'Announcements' },
  { name: 'hashtag', tier: 1, category: 'General' },
  { name: 'home', tier: 1, category: 'Main' },
  { name: 'users', tier: 1, category: 'Team' },
  { name: 'user', tier: 1, category: 'Member' },
  { name: 'message', tier: 1, category: 'Discussion' },
  { name: 'messages', tier: 1, category: 'Chat' },
  { name: 'star', tier: 1, category: 'Important' },
  { name: 'folder', tier: 1, category: 'Organization' },

  // Tier 2: Popular Categories (Second Row)
  { name: 'briefcase', tier: 2, category: 'Business' },
  { name: 'gamepad', tier: 2, category: 'Gaming' },
  { name: 'image', tier: 2, category: 'Media' },
  { name: 'camera', tier: 2, category: 'Photos' },
  { name: 'video', tier: 2, category: 'Video' },
  { name: 'microphone', tier: 2, category: 'Audio' },
  { name: 'volume', tier: 2, category: 'Sound' },
  { name: 'player-play', tier: 2, category: 'Playback' },
  { name: 'smile', tier: 2, category: 'Fun' },
  { name: 'mood-happy', tier: 2, category: 'Mood' },

  // Tier 3: Work & Organization
  { name: 'book', tier: 3, category: 'Documentation' },
  { name: 'file', tier: 3, category: 'Files' },
  { name: 'file-code', tier: 3, category: 'Code Files' },
  { name: 'paperclip', tier: 3, category: 'Attachments' },
  { name: 'tools', tier: 3, category: 'Development' },
  { name: 'hammer', tier: 3, category: 'Build' },
  { name: 'code', tier: 3, category: 'Programming' },
  { name: 'settings', tier: 3, category: 'Settings' },
  { name: 'shield', tier: 3, category: 'Security' },
  { name: 'bug', tier: 3, category: 'Issues' },

  // Tier 4: Communication & Events
  { name: 'bell', tier: 4, category: 'Notifications' },
  { name: 'envelope', tier: 4, category: 'Mail' },
  { name: 'phone', tier: 4, category: 'Calls' },
  { name: 'broadcast', tier: 4, category: 'Live' },
  { name: 'calendar-alt', tier: 4, category: 'Events' },
  { name: 'gift', tier: 4, category: 'Rewards' },
  { name: 'party', tier: 4, category: 'Celebrations' },
  { name: 'heart', tier: 4, category: 'Community' },
  { name: 'hand-peace', tier: 4, category: 'Friendly' },

  // Tier 5: Support & Information
  { name: 'info-circle', tier: 5, category: 'Information' },
  { name: 'support', tier: 5, category: 'Support' },
  { name: 'question-circle', tier: 5, category: 'FAQ' },
  { name: 'check-circle', tier: 5, category: 'Success' },
  { name: 'warning', tier: 5, category: 'Alerts' },
  { name: 'search', tier: 5, category: 'Research' },
  { name: 'bookmark', tier: 5, category: 'Resources' },
  { name: 'pin', tier: 5, category: 'Pinned' },
  { name: 'flag', tier: 5, category: 'Flagged' },
  { name: 'badge', tier: 5, category: 'Badges' },
  { name: 'ticket', tier: 5, category: 'Tickets' },

  // Tier 6: Specialized Interests
  { name: 'dollar-sign', tier: 6, category: 'Finance' },
  { name: 'wallet', tier: 6, category: 'Wallet' },
  { name: 'currency-bitcoin', tier: 6, category: 'Crypto' },
  { name: 'building-bank', tier: 6, category: 'Banking' },
  { name: 'building-store', tier: 6, category: 'Marketplace' },
  { name: 'utensils', tier: 6, category: 'Food' },
  { name: 'paw', tier: 6, category: 'Animals' },
  { name: 'leaf', tier: 6, category: 'Nature' },
  { name: 'seedling', tier: 6, category: 'Nature' },
  { name: 'tree', tier: 6, category: 'Outdoors' },
  { name: 'headset', tier: 6, category: 'Gaming Communication' },
  { name: 'chart-line', tier: 6, category: 'Analytics' },
  { name: 'trophy', tier: 6, category: 'Achievements' },

  // Tier 7: Network, Travel & Privacy
  { name: 'globe', tier: 7, category: 'Network' },
  { name: 'compass', tier: 7, category: 'Explore' },
  { name: 'map-pin', tier: 7, category: 'Location' },
  { name: 'plane', tier: 7, category: 'Travel' },
  { name: 'link', tier: 7, category: 'Links' },
  { name: 'at', tier: 7, category: 'Mentions' },
  { name: 'lock', tier: 7, category: 'Privacy' },
  { name: 'shield-lock', tier: 7, category: 'Encrypted' },
  { name: 'key', tier: 7, category: 'Keys' },
  { name: 'eye', tier: 7, category: 'Visibility' },

  // Tier 8: Roles, Devices & Actions
  { name: 'crown', tier: 8, category: 'Owner' },
  { name: 'desktop', tier: 8, category: 'Devices' },
  { name: 'device-floppy', tier: 8, category: 'Saved' },
  { name: 'stack', tier: 8, category: 'Stacks' },
  { name: 'target', tier: 8, category: 'Goals' },
  { name: 'certificate', tier: 8, category: 'Official' },
  { name: 'bolt', tier: 8, category: 'Power' },

  // Tier 9: Creative, Symbols & Special Purpose
  { name: 'palette', tier: 9, category: 'Art' },
  { name: 'brush', tier: 9, category: 'Design' },
  { name: 'sparkles', tier: 9, category: 'Highlights' },
  { name: 'flask', tier: 9, category: 'Experiments' },
  { name: 'robot', tier: 9, category: 'Sci-Fi' },
  { name: 'ai', tier: 9, category: 'AI' },
  { name: 'fire', tier: 9, category: 'Hot' },
  { name: 'sword', tier: 9, category: 'Combat' },
  { name: 'sun', tier: 9, category: 'Day' },
  { name: 'moon', tier: 9, category: 'Night' },
  { name: 'clock', tier: 9, category: 'Time' },
  { name: 'circle', tier: 9, category: 'Shapes' },
  { name: 'square', tier: 9, category: 'Shapes' },
];

// Icon colors in rainbow order: app-default, blue, purple, fuchsia, green, orange, yellow, red
export const ICON_COLORS: ColorOption[] = [
  { value: 'default', label: 'Default', class: 'text-subtle', hex: '#9ca3af' },
  { value: 'blue', label: 'Blue', class: 'text-accent-blue', hex: '#3b82f6' },
  { value: 'purple', label: 'Purple', class: 'text-accent-purple', hex: '#8b5cf6' },
  { value: 'fuchsia', label: 'Fuchsia', class: 'text-accent-fuchsia', hex: '#d946ef' },
  { value: 'green', label: 'Green', class: 'text-accent-green', hex: '#22c55e' },
  { value: 'orange', label: 'Orange', class: 'text-accent-orange', hex: '#f97316' },
  { value: 'yellow', label: 'Yellow', class: 'text-accent-yellow', hex: '#ca8a04' },
  { value: 'red', label: 'Red', class: 'text-accent-red', hex: '#ef4444' },
];

// Dimmed colors for folder backgrounds — light theme (25% less saturation)
export const FOLDER_COLORS: ColorOption[] = [
  { value: 'default', label: 'Default', class: 'text-subtle', hex: '#6b7280' },
  { value: 'blue', label: 'Blue', class: 'text-accent-blue', hex: '#5f8eeb' },
  { value: 'purple', label: 'Purple', class: 'text-accent-purple', hex: '#9673ea' },
  { value: 'fuchsia', label: 'Fuchsia', class: 'text-accent-fuchsia', hex: '#c54cc7' },
  { value: 'green', label: 'Green', class: 'text-accent-green', hex: '#40b589' },
  { value: 'orange', label: 'Orange', class: 'text-accent-orange', hex: '#ec814a' },
  { value: 'yellow', label: 'Yellow', class: 'text-accent-yellow', hex: '#d4a017' },
  { value: 'red', label: 'Red', class: 'text-accent-red', hex: '#e7615d' },
];

// Helper function to get icon color hex value
export const getIconColorHex = (iconColor?: IconColor): string => {
  if (!iconColor || iconColor === 'default') {
    return '#9ca3af'; // default gray
  }

  const colorOption = ICON_COLORS.find(color => color.value === iconColor);
  if (!colorOption) {
    logger.warn(`getIconColorHex: Unknown color '${iconColor}', using default`);
    return '#9ca3af'; // default gray
  }

  return colorOption.hex;
};

// Theme-specific default gray for folders
const FOLDER_DEFAULT_LIGHT = '#9ca3af'; // lighter gray for light theme (subtle)
const FOLDER_DEFAULT_DARK = '#52525b'; // darker gray for dark theme (subtle)

// Helper function to get folder color hex value (dimmed palette)
// Pass isDarkTheme for theme-specific default gray
export const getFolderColorHex = (iconColor?: IconColor, isDarkTheme?: boolean): string => {
  if (!iconColor || iconColor === 'default') {
    return isDarkTheme ? FOLDER_DEFAULT_DARK : FOLDER_DEFAULT_LIGHT;
  }

  const colorOption = FOLDER_COLORS.find(color => color.value === iconColor);
  return colorOption?.hex ?? (isDarkTheme ? FOLDER_DEFAULT_DARK : FOLDER_DEFAULT_LIGHT);
};

// Helper function to get icon color class (for fallback)
export const getIconColorClass = (iconColor?: IconColor): string => {
  if (!iconColor || iconColor === 'default') return 'text-subtle';
  return `text-accent-${iconColor}`;
};
