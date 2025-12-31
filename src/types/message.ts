/**
 * Message-related types for Quorum
 */

/** Client-side ephemeral status - NEVER persist to storage or include in network payload */
export type MessageSendStatus = 'sending' | 'sent' | 'failed';

export type PostMessage = {
  senderId: string;
  type: 'post';
  text: string | string[];
  repliesToMessageId?: string;
};

export type UpdateProfileMessage = {
  senderId: string;
  type: 'update-profile';
  displayName: string;
  userIcon: string;
};

export type RemoveMessage = {
  senderId: string;
  type: 'remove-message';
  removeMessageId: string;
};

export type EventMessage = {
  senderId: string;
  type: 'event';
  text: string;
  repliesToMessageId?: string;
};

export type EmbedMessage = {
  senderId: string;
  type: 'embed';
  imageUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  width?: string;
  height?: string;
  isLargeGif?: boolean;
  repliesToMessageId?: string;
};

export type ReactionMessage = {
  senderId: string;
  type: 'reaction';
  reaction: string;
  messageId: string;
};

export type RemoveReactionMessage = {
  senderId: string;
  type: 'remove-reaction';
  reaction: string;
  messageId: string;
};

export type JoinMessage = {
  senderId: string;
  type: 'join';
};

export type LeaveMessage = {
  senderId: string;
  type: 'leave';
};

export type KickMessage = {
  senderId: string;
  type: 'kick';
};

export type MuteMessage = {
  senderId: string;
  type: 'mute';
  targetUserId: string;
  muteId: string;
  timestamp: number;
  action: 'mute' | 'unmute';
  duration?: number;
};

export type StickerMessage = {
  senderId: string;
  type: 'sticker';
  stickerId: string;
  repliesToMessageId?: string;
};

export type PinMessage = {
  senderId: string;
  type: 'pin';
  targetMessageId: string;
  action: 'pin' | 'unpin';
};

export type DeleteConversationMessage = {
  senderId: string;
  type: 'delete-conversation';
};

export type EditMessage = {
  senderId: string;
  type: 'edit-message';
  originalMessageId: string;
  editedText: string | string[];
  editedAt: number;
  editNonce: string;
  editSignature?: string;
};

export type MessageContent =
  | PostMessage
  | EventMessage
  | EmbedMessage
  | ReactionMessage
  | RemoveReactionMessage
  | RemoveMessage
  | JoinMessage
  | LeaveMessage
  | KickMessage
  | MuteMessage
  | UpdateProfileMessage
  | StickerMessage
  | PinMessage
  | DeleteConversationMessage
  | EditMessage;

export type Reaction = {
  emojiId: string;
  spaceId: string;
  emojiName: string;
  count: number;
  memberIds: string[];
};

export type Mentions = {
  memberIds: string[];
  roleIds: string[];
  channelIds: string[];
  everyone?: boolean;
  totalMentionCount?: number;
};

export type Message = {
  channelId: string;
  spaceId: string;
  messageId: string;
  digestAlgorithm: string;
  nonce: string;
  createdDate: number;
  modifiedDate: number;
  lastModifiedHash: string;
  content: MessageContent;
  reactions: Reaction[];
  mentions: Mentions;
  replyMetadata?: {
    parentAuthor: string;
    parentChannelId: string;
  };
  publicKey?: string;
  signature?: string;
  isPinned?: boolean;
  pinnedAt?: number;
  pinnedBy?: string;
  edits?: Array<{
    text: string | string[];
    modifiedDate: number;
    lastModifiedHash: string;
  }>;
  /** Client-side ephemeral - NEVER persist or transmit */
  sendStatus?: MessageSendStatus;
  /** Client-side ephemeral - sanitized error message for display */
  sendError?: string;
};
