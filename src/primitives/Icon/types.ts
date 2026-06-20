import { ReactNode } from 'react';

export type IconName =
  // Essential & Status
  | 'check'
  | 'checks'
  | 'check-circle'
  | 'check-square'
  | 'square'
  | 'close'
  | 'sun'
  | 'moon'
  | 'search'
  | 'info-circle'
  | 'warning'
  | 'error'
  | 'spinner'
  | 'clock'
  | 'circle'
  | 'radio'
  | 'target'

  // Navigation & UI
  | 'plus'
  | 'minus'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'compress-alt'
  | 'sliders'
  | 'sidebar-left-expand'
  | 'sidebar-left-collapse'
  | 'home'
  | 'menu'
  | 'dots'
  | 'dots-vertical'
  | 'grip-vertical'
  | 'refresh'
  | 'repeat'
  | 'external-link'
  | 'filter'
  | 'sort'
  | 'layout-grid'
  | 'layout-grid-add'
  | 'grid-dots'
  | 'list-search'
  | 'arrow-up-right'
  | 'arrow-down-left'
  | 'arrow-down-right'
  | 'arrows-up-down'
  | 'arrows-exchange'
  | 'merge'
  | 'split'
  | 'arrow-forward-up'
  | 'circle-arrow-up'
  | 'circle-arrow-down'
  | 'circle-arrow-left'
  | 'circle-arrow-right'
  | 'circle-plus'
  | 'circle-x'
  | 'maximize'
  | 'minimize'

  // Actions
  | 'reply'
  | 'undo'
  | 'link'
  | 'link-plus'
  | 'trash'
  | 'edit'
  | 'pencil'
  | 'feather'
  | 'copy'
  | 'share'
  | 'download'
  | 'upload'
  | 'save'
  | 'clipboard'
  | 'print'
  | 'pin'
  | 'pin-off'
  | 'scan'
  | 'sparkles'
  | 'thumb-up'
  | 'thumb-down'

  // Communication & Social
  | 'envelope'
  | 'mail-opened'
  | 'send'
  | 'bullhorn'
  | 'broadcast'
  | 'message'
  | 'message-dots'
  | 'comment-dots' // Legacy alias (FontAwesome name)
  | 'messages'
  | 'phone'
  | 'phone-off'
  | 'user'
  | 'user-circle'
  | 'user-exclamation'
  | 'users'
  | 'users-group'
  | 'user-plus'
  | 'user-x'
  | 'user-minus'
  | 'user-question'
  | 'user-search'
  | 'message-search'
  | 'hand-stop'
  | 'party'
  | 'gift'
  | 'hand-peace'
  | 'hand-rock'
  | 'ban'
  | 'cake'
  | 'glass'
  | 'smile'
  | 'mood-happy'
  | 'heart'
  | 'heart-off'
  | 'star'
  | 'star-off'
  | 'eye'
  | 'eye-off'
  | 'support'
  | 'volume'
  | 'volume-off'

  | 'key'

  // Settings & Security
  | 'settings'
  | 'shield'
  | 'shield-check'
  | 'shield-lock'
  | 'shield-x'
  | 'crown'
  | 'lock'
  | 'unlock'
  | 'login'
  | 'logout'
  | 'palette'
  | 'bell'
  | 'bell-off'
  | 'bell-x'
  | 'face-id'

  // Files & Media
  | 'file'
  | 'file-text'
  | 'image'
  | 'folder'
  | 'folders'
  | 'folder-minus'
  | 'bookmark'
  | 'bookmark-off'
  | 'paperclip'
  | 'at'
  | 'hashtag'
  | 'calendar-alt'
  | 'history'
  | 'memo'
  | 'notes'
  | 'player-play'
  | 'player-pause'
  | 'camera'
  | 'camera-rotate'
  | 'video-off'
  | 'qrcode'
  | 'microphone-off'

  // Devices & Hardware
  | 'desktop'
  | 'mobile'
  | 'device'
  | 'device-floppy'
  | 'tablet'
  | 'video'
  | 'microphone'
  | 'gamepad'
  | 'headset'
  | 'wifi-off'
  | 'server'

  // Development & Code
  | 'code'
  | 'terminal'
  | 'file-code'
  | 'book'
  | 'clipboard-list'
  | 'bug'
  | 'flask'
  | 'chart-line'
  | 'badge'
  | 'id-badge'
  | 'certificate'
  | 'tools'
  | 'briefcase'

  // Text formatting
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'heading'
  | 'quote'

  // Labels & Tags
  | 'tag'
  | 'tag-off'
  | 'flag'
  | 'ticket'
  | 'trophy'
  | 'stack'

  // Charts
  | 'chart-bar'

  // Miscellaneous
  | 'wallet'
  | 'cash'
  | 'credit-card'
  | 'building-bank'
  | 'building-store'
  | 'map-pin'
  | 'brush'
  | 'bolt'
  | 'hammer'
  | 'dollar-sign'
  | 'currency-bitcoin'
  | 'question-circle'
  | 'question-mark'
  | 'leaf'
  | 'paw'
  | 'utensils'
  | 'burger'
  | 'basketball'
  | 'bulb'
  | 'sword'
  | 'tree'
  | 'seedling'
  | 'robot'
  | 'ai'
  | 'fire'
  | 'globe'
  | 'globe-search'
  | 'world-map'
  | 'compass'
  | 'plane'

  // Custom SVG icons
  | 'farcaster'
  | 'quilibrium'
  | 'quorum'
  | 'apex-star'
  | 'qns';

export type IconSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | number;

export type IconVariant = 'outline' | 'filled';

export interface IconProps {
  name: IconName;
  size?: IconSize;
  color?: string;
  className?: string;
  style?: any;
  disabled?: boolean;
  children?: ReactNode;
  id?: string;
  onClick?: () => void;
  /**
   * Icon variant style
   * - 'outline': Stroke-based icon (default)
   * - 'filled': Solid filled icon
   * Note: Not all icons have filled variants. If a filled variant doesn't exist,
   * the component will fall back to the outline version and log a warning.
   */
  variant?: IconVariant;
  /**
   * When true, custom icons with per-path brand colors render in their original
   * colors instead of inheriting the current text color. Has no effect on Tabler
   * icons or custom icons that don't define per-path fills.
   */
  colored?: boolean;
}

export interface IconWebProps extends IconProps {
  // Web-specific props can be added here if needed
}

export interface IconNativeProps extends IconProps {
  // Native-specific props can be added here if needed
}
