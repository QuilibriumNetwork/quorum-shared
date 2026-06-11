import React from 'react';

export interface InputProps {
  /** Input value */
  value?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Change handler - receives the string value */
  onChange?: (value: string) => void;
  /** Key down handler (web only) */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Input variant */
  variant?: 'filled' | 'bordered' | 'onboarding' | 'minimal';
  /** Blur handler */
  onBlur?: () => void;
  /** Focus handler */
  onFocus?: () => void;
  /** Input type */
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
  /** Error state */
  error?: boolean;
  /** Error message */
  errorMessage?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Disable focus styling (border and shadow) */
  noFocusStyle?: boolean;
  /** Auto focus */
  autoFocus?: boolean;
  /** Additional CSS classes (web only) */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Test ID for automation */
  testID?: string;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Label text */
  label?: string;
  /** Label type - static shows above input, floating animates on focus/value */
  labelType?: 'static' | 'floating';
  /** Show required indicator */
  required?: boolean;
  /** Helper text shown below the input */
  helperText?: string;
  /** Show a clear (×) control when there is input (web only) */
  clearable?: boolean;
  /**
   * Icon/element rendered inside the field, before the text (left side).
   * The consumer passes its own node (e.g. an <Icon /> or a clickable button).
   * The input is automatically padded to make room.
   */
  leftIcon?: React.ReactNode;
  /**
   * Icon/element rendered inside the field, after the text (right side).
   * Useful for reveal toggles, status indicators, or actions.
   * The input is automatically padded to make room.
   */
  rightIcon?: React.ReactNode;
}

// React Native specific props
export interface InputNativeProps extends Omit<InputProps, 'className'> {
  /** Keyboard type for React Native */
  keyboardType?:
    | 'default'
    | 'email-address'
    | 'numeric'
    | 'phone-pad'
    | 'number-pad'
    | 'decimal-pad'
    | 'url';
  /** Return key type */
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  /** Auto complete type */
  autoComplete?: 'off' | 'email' | 'name' | 'tel' | 'username' | 'password';
  /** Secure text entry for passwords */
  secureTextEntry?: boolean;
  /** Submit handler for return key */
  onSubmitEditing?: () => void;
}
