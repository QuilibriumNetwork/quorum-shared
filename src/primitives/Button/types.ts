import { IconName, IconSize, IconVariant } from '../Icon/types';

export interface BaseButtonProps {
  id?: string;
  type?:
    | 'primary'
    | 'secondary'
    | 'light'
    | 'light-outline'
    | 'subtle'
    | 'subtle-outline'
    | 'danger'
    | 'danger-outline'
    | 'unstyled';
  size?: 'compact' | 'small' | 'normal' | 'large';
  disabled?: boolean;
  fullWidth?: boolean; // If true, button takes full width of container
  icon?: boolean; // Legacy prop for existing compatibility
  iconName?: IconName; // FontAwesome icon to display (left of text or icon-only)
  iconSize?: IconSize; // Custom icon size (overrides size-based default)
  iconVariant?: IconVariant; // Icon variant (outline or filled)
  iconOnly?: boolean; // If true, only show icon without text
  className?: string;
  ariaLabel?: string;
  /**
   * Native-only, ignored on web. Declared on the base so a component shared
   * between the two apps can pass it without a platform branch.
   */
  hapticFeedback?: boolean;
  tooltip?: string;
  children?: React.ReactNode;
}

export interface WebButtonProps extends BaseButtonProps {
  /**
   * `event` is required rather than optional so a handler that needs it, e.g.
   * `(e) => e.stopPropagation()`, is assignable. A zero-arg `() => void` still
   * is, since a function with fewer parameters always assigns.
   */
  onClick: (event: React.MouseEvent) => void;
}

export interface NativeButtonProps extends BaseButtonProps {
  /** No DOM event on native, so the handler takes nothing. */
  onClick: () => void;
  // Native-specific props (hapticFeedback is declared on the base — see there)
  accessibilityLabel?: string;
  fullWidthWithMargin?: boolean; // If true, button takes full width but with 40px left/right margins
}
