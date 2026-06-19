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
  | 'red'
  // Expanded 2026-06-14 (role-color palette): four extra hues so roles have
  // enough distinct colors. Additive — existing stored values are unaffected.
  // Both desktop and mobile render these via the `hex` field (getIconColorHex /
  // getFolderColorHex / getRoleColorHex), so no per-token CSS is required — the
  // `class` field below is vestigial (getIconColorClass is never called).
  | 'teal'
  | 'sky'
  | 'indigo'
  | 'pink';

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

// Curated picker icons grouped into tight semantic clusters — neighbors always
// relate, so the grid reads as coherent themed blocks rather than a scattered wall.
// Expanded 2026-06-12: 49 -> 92. All names are already renderable by the shared Icon
// primitive (no mapping work). `tier` here just marks the cluster (display order =
// array order); `category` feeds the accessibility label.
export const ICON_OPTIONS: IconOption[] = [
  // 1 — Essentials & Spaces
  { name: 'bullhorn', tier: 1, category: 'Announcements' },
  { name: 'hashtag', tier: 1, category: 'General' },
  { name: 'home', tier: 1, category: 'Main' },
  { name: 'folder', tier: 1, category: 'Organization' },
  { name: 'star', tier: 1, category: 'Important' },
  { name: 'pin', tier: 1, category: 'Pinned' },
  { name: 'bookmark', tier: 1, category: 'Resources' },

  // 2 — People & Social
  { name: 'user', tier: 2, category: 'Member' },
  { name: 'users', tier: 2, category: 'Team' },
  { name: 'crown', tier: 2, category: 'Owner' },
  { name: 'heart', tier: 2, category: 'Community' },
  { name: 'hand-peace', tier: 2, category: 'Friendly' },
  { name: 'smile', tier: 2, category: 'Fun' },
  { name: 'mood-happy', tier: 2, category: 'Mood' },
  { name: 'party', tier: 2, category: 'Celebrations' },
  { name: 'gift', tier: 2, category: 'Rewards' },

  // 3 — Communication
  { name: 'message', tier: 3, category: 'Discussion' },
  { name: 'messages', tier: 3, category: 'Chat' },
  { name: 'envelope', tier: 3, category: 'Mail' },
  { name: 'phone', tier: 3, category: 'Calls' },
  { name: 'broadcast', tier: 3, category: 'Live' },
  { name: 'bell', tier: 3, category: 'Notifications' },
  { name: 'at', tier: 3, category: 'Mentions' },

  // 4 — Media
  { name: 'image', tier: 4, category: 'Media' },
  { name: 'camera', tier: 4, category: 'Photos' },
  { name: 'video', tier: 4, category: 'Video' },
  { name: 'microphone', tier: 4, category: 'Audio' },
  { name: 'volume', tier: 4, category: 'Sound' },
  { name: 'player-play', tier: 4, category: 'Playback' },
  { name: 'palette', tier: 4, category: 'Art' },
  { name: 'brush', tier: 4, category: 'Design' },

  // 5 — Work, Files & Dev
  { name: 'briefcase', tier: 5, category: 'Business' },
  { name: 'book', tier: 5, category: 'Documentation' },
  { name: 'file', tier: 5, category: 'Files' },
  { name: 'file-code', tier: 5, category: 'Code Files' },
  { name: 'paperclip', tier: 5, category: 'Attachments' },
  { name: 'code', tier: 5, category: 'Programming' },
  { name: 'tools', tier: 5, category: 'Development' },
  { name: 'hammer', tier: 5, category: 'Build' },
  { name: 'settings', tier: 5, category: 'Settings' },
  { name: 'bug', tier: 5, category: 'Issues' },
  { name: 'flask', tier: 5, category: 'Experiments' },
  { name: 'robot', tier: 5, category: 'Sci-Fi' },
  { name: 'ai', tier: 5, category: 'AI' },

  // 6 — Money & Commerce
  { name: 'dollar-sign', tier: 6, category: 'Finance' },
  { name: 'wallet', tier: 6, category: 'Wallet' },
  { name: 'currency-bitcoin', tier: 6, category: 'Crypto' },
  { name: 'building-bank', tier: 6, category: 'Banking' },
  { name: 'building-store', tier: 6, category: 'Marketplace' },
  { name: 'ticket', tier: 6, category: 'Tickets' },

  // 7 — Nature & Sky
  { name: 'sun', tier: 7, category: 'Day' },
  { name: 'moon', tier: 7, category: 'Night' },
  { name: 'leaf', tier: 7, category: 'Nature' },
  { name: 'seedling', tier: 7, category: 'Nature' },
  { name: 'tree', tier: 7, category: 'Outdoors' },
  { name: 'paw', tier: 7, category: 'Animals' },
  { name: 'utensils', tier: 7, category: 'Food' },
  { name: 'fire', tier: 7, category: 'Hot' },

  // 8 — Gaming, Combat & Achievements
  { name: 'gamepad', tier: 8, category: 'Gaming' },
  { name: 'sword', tier: 8, category: 'Combat' },
  { name: 'headset', tier: 8, category: 'Gaming Communication' },
  { name: 'target', tier: 8, category: 'Goals' },
  { name: 'trophy', tier: 8, category: 'Achievements' },
  { name: 'badge', tier: 8, category: 'Badges' },
  { name: 'certificate', tier: 8, category: 'Official' },

  // 9 — Travel & Places
  { name: 'globe', tier: 9, category: 'Network' },
  { name: 'compass', tier: 9, category: 'Explore' },
  { name: 'world-map', tier: 9, category: 'Map' },
  { name: 'map-pin', tier: 9, category: 'Location' },
  { name: 'plane', tier: 9, category: 'Travel' },
  { name: 'link', tier: 9, category: 'Links' },

  // 10 — Security & Privacy
  { name: 'shield', tier: 10, category: 'Security' },
  { name: 'shield-lock', tier: 10, category: 'Encrypted' },
  { name: 'lock', tier: 10, category: 'Privacy' },
  { name: 'key', tier: 10, category: 'Keys' },
  { name: 'eye', tier: 10, category: 'Visibility' },

  // 11 — Status & Info
  { name: 'info-circle', tier: 11, category: 'Information' },
  { name: 'question-circle', tier: 11, category: 'FAQ' },
  { name: 'check-circle', tier: 11, category: 'Success' },
  { name: 'warning', tier: 11, category: 'Alerts' },
  { name: 'support', tier: 11, category: 'Support' },
  { name: 'search', tier: 11, category: 'Research' },
  { name: 'flag', tier: 11, category: 'Flagged' },
  { name: 'chart-line', tier: 11, category: 'Analytics' },

  // 12 — Time, Devices & Symbols
  { name: 'calendar-alt', tier: 12, category: 'Events' },
  { name: 'clock', tier: 12, category: 'Time' },
  { name: 'desktop', tier: 12, category: 'Devices' },
  { name: 'device-floppy', tier: 12, category: 'Saved' },
  { name: 'stack', tier: 12, category: 'Stacks' },
  { name: 'bolt', tier: 12, category: 'Power' },
  { name: 'sparkles', tier: 12, category: 'Highlights' },
  { name: 'circle', tier: 12, category: 'Shapes' },
  { name: 'square', tier: 12, category: 'Shapes' },
];

// Icon colors in rainbow order: app-default, blue, sky, teal, green, yellow,
// orange, red, pink, fuchsia, purple, indigo.
// `yellow` was #ca8a04 (a muddy mustard that reads poorly as a badge fill) —
// corrected to #eab308 on 2026-06-14. teal/sky/indigo/pink added the same day
// so the role-color palette has enough distinct hues (see getRoleColorHex).
export const ICON_COLORS: ColorOption[] = [
  { value: 'default', label: 'Default', class: 'text-subtle', hex: '#9ca3af' },
  { value: 'red', label: 'Red', class: 'text-accent-red', hex: '#ef4444' },
  { value: 'orange', label: 'Orange', class: 'text-accent-orange', hex: '#f97316' },
  { value: 'yellow', label: 'Yellow', class: 'text-accent-yellow', hex: '#eab308' },
  { value: 'green', label: 'Green', class: 'text-accent-green', hex: '#22c55e' },
  { value: 'teal', label: 'Teal', class: 'text-accent-teal', hex: '#14b8a6' },
  { value: 'sky', label: 'Sky', class: 'text-accent-sky', hex: '#0ea5e9' },
  { value: 'blue', label: 'Blue', class: 'text-accent-blue', hex: '#3b82f6' },
  { value: 'indigo', label: 'Indigo', class: 'text-accent-indigo', hex: '#6366f1' },
  { value: 'purple', label: 'Purple', class: 'text-accent-purple', hex: '#8b5cf6' },
  { value: 'fuchsia', label: 'Fuchsia', class: 'text-accent-fuchsia', hex: '#d946ef' },
  { value: 'pink', label: 'Pink', class: 'text-accent-pink', hex: '#ec4899' },
];

// Dimmed colors for folder backgrounds — light theme (25% less saturation).
// New hues (teal/sky/indigo/pink) added 2026-06-14 to mirror ICON_COLORS.
export const FOLDER_COLORS: ColorOption[] = [
  { value: 'default', label: 'Default', class: 'text-subtle', hex: '#6b7280' },
  { value: 'red', label: 'Red', class: 'text-accent-red', hex: '#e7615d' },
  { value: 'orange', label: 'Orange', class: 'text-accent-orange', hex: '#ec814a' },
  { value: 'yellow', label: 'Yellow', class: 'text-accent-yellow', hex: '#d4a017' },
  { value: 'green', label: 'Green', class: 'text-accent-green', hex: '#40b589' },
  { value: 'teal', label: 'Teal', class: 'text-accent-teal', hex: '#3fa99a' },
  { value: 'sky', label: 'Sky', class: 'text-accent-sky', hex: '#3f9fd1' },
  { value: 'blue', label: 'Blue', class: 'text-accent-blue', hex: '#5f8eeb' },
  { value: 'indigo', label: 'Indigo', class: 'text-accent-indigo', hex: '#7376e0' },
  { value: 'purple', label: 'Purple', class: 'text-accent-purple', hex: '#9673ea' },
  { value: 'fuchsia', label: 'Fuchsia', class: 'text-accent-fuchsia', hex: '#c54cc7' },
  { value: 'pink', label: 'Pink', class: 'text-accent-pink', hex: '#d36493' },
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
