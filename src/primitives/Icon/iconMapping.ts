import { IconName } from './types';

/**
 * Icon Mapping - Maps semantic icon names to icon library component names
 *
 * Implementation: Currently using Tabler Icons
 * - PascalCase with "Icon" prefix
 * - kebab-case SVG names become PascalCase (e.g., "arrow-left" → "IconArrowLeft")
 * - Most icons use the "outline" style by default
 *
 * Reference: https://tabler.io/icons
 */
export const iconComponentMap: Record<IconName, string> = {
  // Essential & Status
  check: 'IconCheck',
  checks: 'IconChecks',
  'check-circle': 'IconCircleCheck',
  'check-square': 'IconSquareCheck',
  square: 'IconSquare',
  close: 'IconX',
  sun: 'IconSun',
  moon: 'IconMoon',
  search: 'IconSearch',
  'info-circle': 'IconInfoCircle',
  warning: 'IconAlertTriangle',
  error: 'IconAlertCircle',
  spinner: 'IconLoader',
  clock: 'IconClock',
  circle: 'IconCircle',
  radio: 'IconCircleDot',
  target: 'IconTarget',

  // Navigation & UI
  plus: 'IconPlus',
  minus: 'IconMinus',
  'arrow-left': 'IconArrowLeft',
  'arrow-right': 'IconArrowRight',
  'arrow-up': 'IconArrowUp',
  'arrow-down': 'IconArrowDown',
  'chevron-left': 'IconChevronLeft',
  'chevron-right': 'IconChevronRight',
  'chevron-up': 'IconChevronUp',
  'chevron-down': 'IconChevronDown',
  'compress-alt': 'IconArrowsMinimize',
  sliders: 'IconAdjustments',
  'sidebar-left-expand': 'IconLayoutSidebarLeftExpand',
  'sidebar-left-collapse': 'IconLayoutSidebarLeftCollapse',
  home: 'IconHome',
  menu: 'IconMenu2',
  dots: 'IconDots',
  'dots-vertical': 'IconDotsVertical',
  'grip-vertical': 'IconGripVertical',
  refresh: 'IconRefresh',
  repeat: 'IconRepeat',
  'external-link': 'IconExternalLink',
  filter: 'IconFilter',
  sort: 'IconArrowsSort',
  'layout-grid': 'IconLayoutGrid',
  'layout-grid-add': 'IconLayoutGridAdd',
  'grid-dots': 'IconGridDots',
  'list-search': 'IconListSearch',
  'arrow-up-right': 'IconArrowUpRight',
  'arrow-down-left': 'IconArrowDownLeft',
  'arrow-down-right': 'IconArrowDownRight',
  'arrows-up-down': 'IconArrowsUpDown',
  'arrows-exchange': 'IconArrowsExchange',
  'arrow-forward-up': 'IconArrowForwardUp',
  'circle-arrow-up': 'IconCircleArrowUp',
  'circle-arrow-down': 'IconCircleArrowDown',
  'circle-arrow-left': 'IconCircleArrowLeft',
  'circle-arrow-right': 'IconCircleArrowRight',
  'circle-plus': 'IconCirclePlus',
  'circle-x': 'IconCircleX',
  maximize: 'IconMaximize',
  minimize: 'IconMinimize',

  // Actions
  reply: 'IconArrowBackUp',
  undo: 'IconArrowBackUp', // alias of reply — same Tabler icon, different semantic
  link: 'IconLink',
  'link-plus': 'IconLinkPlus',
  trash: 'IconTrash',
  edit: 'IconEdit',
  pencil: 'IconPencil',
  feather: 'IconFeather',
  copy: 'IconCopy',
  share: 'IconShare',
  download: 'IconDownload',
  upload: 'IconUpload',
  save: 'IconDeviceFloppy',
  clipboard: 'IconClipboard',
  print: 'IconPrinter',
  pin: 'IconPin',
  'pin-off': 'IconPinnedOff',
  scan: 'IconScan',
  sparkles: 'IconSparkles',
  'thumb-up': 'IconThumbUp',
  'thumb-down': 'IconThumbDown',

  // Communication & Social
  envelope: 'IconMail',
  'mail-opened': 'IconMailOpened',
  send: 'IconSend',
  bullhorn: 'IconSpeakerphone',
  broadcast: 'IconBroadcast',
  message: 'IconMessage',
  'message-dots': 'IconMessageDots',
  'comment-dots': 'IconMessageDots', // Legacy alias
  messages: 'IconMessages',
  phone: 'IconPhone',
  'phone-off': 'IconPhoneOff',
  user: 'IconUser',
  'user-circle': 'IconUserCircle',
  'user-exclamation': 'IconUserExclamation',
  users: 'IconUsers',
  'users-group': 'IconUsersGroup',
  'user-plus': 'IconUserPlus',
  'user-x': 'IconUserX',
  'user-minus': 'IconUserMinus',
  'user-question': 'IconUserQuestion',
  'user-search': 'IconUserSearch',
  'message-search': 'IconMessageCircleSearch',
  'hand-stop': 'IconHandStop',
  party: 'IconConfetti',
  gift: 'IconGift',
  'hand-peace': 'IconHandStop',
  'hand-rock': 'IconHandRock',
  ban: 'IconBan',
  cake: 'IconCake',
  glass: 'IconGlassFull',
  smile: 'IconMoodSmile',
  'mood-happy': 'IconMoodHappy',
  heart: 'IconHeart',
  'heart-off': 'IconHeartOff',
  star: 'IconStar',
  'star-off': 'IconStarOff',
  eye: 'IconEye',
  'eye-off': 'IconEyeOff',
  support: 'IconLifebuoy',
  volume: 'IconVolume',
  'volume-off': 'IconVolumeOff',

  // Settings & Security
  settings: 'IconSettings',
  shield: 'IconShield',
  'shield-check': 'IconShieldCheck',
  'shield-lock': 'IconShieldLock',
  'shield-x': 'IconShieldX',
  crown: 'IconCrown',
  key: 'IconKey',
  lock: 'IconLock',
  unlock: 'IconLockOpen',
  login: 'IconLogin',
  logout: 'IconLogout2',
  palette: 'IconPalette',
  bell: 'IconBell',
  'bell-off': 'IconBellOff',
  'bell-x': 'IconBellX',
  'face-id': 'IconFaceId',

  // Files & Media
  file: 'IconFile',
  'file-text': 'IconFileText',
  image: 'IconPhoto',
  folder: 'IconFolder',
  folders: 'IconFolders',
  'folder-minus': 'IconFolderMinus',
  bookmark: 'IconBookmark',
  'bookmark-off': 'IconBookmarkOff',
  paperclip: 'IconPaperclip',
  at: 'IconAt',
  hashtag: 'IconHash',
  'calendar-alt': 'IconCalendar',
  history: 'IconHistory',
  memo: 'IconNote',
  notes: 'IconNotes',
  'player-play': 'IconPlayerPlay',
  'player-pause': 'IconPlayerPause',
  camera: 'IconCamera',
  'camera-rotate': 'IconCameraRotate',
  'video-off': 'IconVideoOff',
  qrcode: 'IconQrcode',
  'microphone-off': 'IconMicrophoneOff',

  // Devices & Hardware
  desktop: 'IconDeviceDesktop',
  mobile: 'IconDeviceMobile',
  device: 'IconDevices',
  'device-floppy': 'IconDeviceFloppy',
  tablet: 'IconDeviceTablet',
  video: 'IconVideo',
  microphone: 'IconMicrophone',
  gamepad: 'IconDeviceGamepad2',
  headset: 'IconHeadphones',
  'wifi-off': 'IconWifiOff',
  server: 'IconServer',

  // Development & Code
  code: 'IconCode',
  terminal: 'IconTerminal2',
  'file-code': 'IconFileCode',
  book: 'IconBook',
  'clipboard-list': 'IconClipboardList',
  bug: 'IconBug',
  flask: 'IconFlask',
  'chart-line': 'IconChartLine',
  badge: 'IconBadge',
  'id-badge': 'IconId',
  certificate: 'IconRosetteDiscountCheck',
  tools: 'IconTools',
  briefcase: 'IconBriefcase',

  // Text formatting
  bold: 'IconBold',
  italic: 'IconItalic',
  strikethrough: 'IconStrikethrough',
  heading: 'IconHeading',
  quote: 'IconQuote',

  // Labels & Tags
  tag: 'IconTag',
  'tag-off': 'IconTagOff',
  flag: 'IconFlag',
  ticket: 'IconTicket',
  trophy: 'IconTrophy',
  stack: 'IconStack2',

  // Charts
  'chart-bar': 'IconChartBar',

  // Miscellaneous
  wallet: 'IconWallet',
  cash: 'IconCash',
  'credit-card': 'IconCreditCard',
  'building-bank': 'IconBuildingBank',
  'building-store': 'IconBuildingStore',
  'map-pin': 'IconMapPin',
  brush: 'IconBrush',
  bolt: 'IconBolt',
  hammer: 'IconHammer',
  'dollar-sign': 'IconCurrencyDollar',
  'currency-bitcoin': 'IconCurrencyBitcoin',
  'question-circle': 'IconHelpCircle',
  'question-mark': 'IconQuestionMark',
  leaf: 'IconLeaf',
  paw: 'IconPaw',
  utensils: 'IconToolsKitchen2',
  burger: 'IconBurger',
  basketball: 'IconBallBasketball',
  bulb: 'IconBulb',
  sword: 'IconSword',
  tree: 'IconPlant2',
  seedling: 'IconSeedling',
  robot: 'IconRobot',
  ai: 'IconAi',
  fire: 'IconFlame',
  globe: 'IconWorld',
  'globe-search': 'IconWorldSearch',
  'world-map': 'IconWorldMap',
  compass: 'IconCompass',
  plane: 'IconPlane',

  // Custom SVG icons — handled separately in Icon.web/native, not via Tabler library.
  // Entry kept here so isValidIconName() recognises the name.
  farcaster: '__custom__',
  quilibrium: '__custom__',
  quorum: '__custom__',
  'apex-star': '__custom__',
  qns: '__custom__',
};

/**
 * Helper function to check if a string is a valid icon name
 */
export function isValidIconName(name: string): name is IconName {
  return name in iconComponentMap;
}

/**
 * Get the icon component name for a semantic icon name
 * Returns null if the icon name is not found
 */
export function getIconComponentName(name: string): string | null {
  if (isValidIconName(name)) {
    return iconComponentMap[name];
  }
  return null;
}
