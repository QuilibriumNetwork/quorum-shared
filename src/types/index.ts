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
  SpaceTag,
  BroadcastSpaceTag,
} from './space';

// Message types
export type {
  MessageSendStatus,
  PostMessage,
  UpdateProfileMessage,
  DMUpdateProfileMessage,
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
  DeleteConversationSelfMessage,
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
  ThreadMessage,
  ThreadMeta,
  ChannelThread,
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
  UserNote,
  UserProfile,
  FarcasterLink,
  PublicProfile,
  SpaceMember,
  SpaceMemberDevice,
} from './user';

// Bookmark types
export type { Bookmark } from './bookmark';
export { BOOKMARKS_CONFIG } from './bookmark';

// Notification types
export type {
  SpaceNotificationTypeId,
  SpaceNotificationSettings,
  SpaceNotificationSettingOption,
  ReplyNotification,
} from './notifications';

// Receipt types (delivery + read ack protocol)
export type {
  DeliveryAckMessage,
  ReadAckMessage,
  ReceiptControlMessage,
  ReceiptControlMessageType,
  ReceiptEnvelopeFields,
} from './receipt';

// Typing types (ephemeral typing-indicator protocol)
export type { TypingMessageType, TypingMessage, TypingScope } from './typing';
export { scopeKey, scopeFromMessage } from './typing';

// Directory types (public space discovery)
export type {
  SpaceCategory,
  DirectoryEntry,
  DirectoryResponse,
} from './directory';
