/**
 * @quorum/shared types
 *
 * All type definitions shared between mobile and desktop apps
 */

// Space types
export type {
  Permission,
  Role,
  Emoji,
  Sticker,
  Group,
  Channel,
  Space,
} from './space';

// Message types
export type {
  MessageSendStatus,
  PostMessage,
  UpdateProfileMessage,
  RemoveMessage,
  EventMessage,
  EmbedMessage,
  ReactionMessage,
  RemoveReactionMessage,
  JoinMessage,
  LeaveMessage,
  KickMessage,
  MuteMessage,
  StickerMessage,
  PinMessage,
  DeleteConversationMessage,
  EditMessage,
  CallOfferMessage,
  CallAnswerMessage,
  CallRejectMessage,
  CallHangupMessage,
  CallIceCandidateMessage,
  CallEventMessage,
  CallRenegotiateMessage,
  SpaceCallStartMessage,
  SpaceCallEndMessage,
  MessageContent,
  Reaction,
  Mentions,
  Message,
} from './message';

// Conversation types
export type { Conversation, ConversationSource } from './conversation';

// User types
export type {
  FolderColor,
  NavItem,
  NotificationSettings,
  UserConfig,
  UserProfile,
  FarcasterLink,
  PublicProfile,
  SpaceMember,
} from './user';

// Bookmark types
export type { Bookmark } from './bookmark';
export { BOOKMARKS_CONFIG } from './bookmark';
