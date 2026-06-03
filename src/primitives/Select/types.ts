export interface SelectOption {
  value: string;
  label: string;
  /** Emoji or Unicode for now; will become an icon name later. */
  icon?: string;
  /** URL; falls back to initials when invalid via `isAvatarValid`. */
  avatar?: string;
  /** Used for initials fallback when avatar is missing/invalid. */
  displayName?: string;
  /** Drives deterministic color generation for the initials fallback. */
  userAddress?: string;
  subtitle?: string;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  groupLabel: string;
  options: SelectOption[];
}

export interface BaseSelectProps {
  /** Single string in single-select, string[] in multiple mode. */
  value?: string | string[];
  /** Use either `options` or `groups`, not both. */
  options?: SelectOption[];
  groups?: SelectOptionGroup[];
  onChange?: (value: string | string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  className?: string;
  style?: React.CSSProperties;
  size?: 'small' | 'medium' | 'large';
  /** Trigger style. Dropdown border is controlled separately by `borderedDropdown`. */
  variant?: 'filled' | 'bordered';
  /** When true, the dropdown panel gets a visible border. */
  borderedDropdown?: boolean;
  fullWidth?: boolean;
  /** CSS value on web, number on native. */
  width?: string | number;

  /** Render a custom avatar for an option. Receives the option and a size hint. */
  renderAvatar?: (option: SelectOption, size: number) => React.ReactNode;
  /** Defaults to a truthy check on `option.avatar`. */
  isAvatarValid?: (avatarUrl: string) => boolean;

  multiple?: boolean;
  /** Custom rendering for the selected chip(s) in multiple mode. */
  renderSelectedValue?: (
    selected: string[],
    options: SelectOption[]
  ) => React.ReactNode;
  selectAllLabel?: string;
  clearAllLabel?: string;
  maxHeight?: string | number;
  /** Defaults to true when `multiple`. */
  showSelectAllOption?: boolean;
  /** Selected chips beyond this count collapse into a "+N" badge. */
  maxDisplayedChips?: number;

  /** Hides the selected value and shows only the icon button. */
  compactMode?: boolean;
  /** Defaults to 'filter'. */
  compactIcon?: string;
  /** Compact-mode badge with the selection count. */
  showSelectionCount?: boolean;
}

export interface WebSelectProps extends BaseSelectProps {
  name?: string;
  id?: string;
  autoFocus?: boolean;
  dropdownPlacement?: 'top' | 'bottom' | 'auto';
  /** Extra class(es) applied to the portaled dropdown panel. */
  dropdownClassName?: string;
}

export interface NativeSelectProps extends BaseSelectProps {
  testID?: string;
}
