// @ts-ignore - Platform-specific files (.web.tsx/.native.tsx) resolved by bundler
export { Icon } from './Icon';
export type {
  IconProps,
  IconWebProps,
  IconNativeProps,
  IconName,
  IconSize,
  IconVariant,
} from './types';
// Export mapping utilities (implementation-agnostic interface)
export { iconComponentMap as iconNames, isValidIconName, getIconComponentName } from './iconMapping';

// Picker vocabulary (curated icon list + named colors + filled-variant set + helpers)
export {
  ICON_OPTIONS,
  ICON_COLORS,
  FOLDER_COLORS,
  FILLED_ICONS,
  getIconColorHex,
  getFolderColorHex,
  getIconColorClass,
} from './pickerVocabulary';
export type { IconColor, IconOption, ColorOption } from './pickerVocabulary';
