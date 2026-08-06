export interface BaseModalProps {
  title: string;
  visible: boolean;
  onClose: () => void;
  hideClose?: boolean;
  children: React.ReactNode;

  // Additional props for enhanced functionality
  size?: 'small' | 'medium' | 'large';
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  noPadding?: boolean;
  titleAlign?: 'left' | 'center';
  /**
   * Native-only, ignored on web. Declared on the base so a component shared
   * between the two apps can pass it without a platform branch.
   */
  swipeToClose?: boolean;
}

export interface WebModalProps extends BaseModalProps {
  // Web-specific props if needed
}

export interface NativeModalProps extends BaseModalProps {
  // Native-specific props (swipeToClose is declared on the base — see there)
  swipeUpToOpen?: boolean;
}
