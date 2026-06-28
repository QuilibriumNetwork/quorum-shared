
/**
 * Message-related types for Quorum
 */

import type { BroadcastSpaceTag } from './space';

/** Client-side ephemeral status - NEVER persist to storage or include in network payload */
export type MessageSendStatus = 'sending' | 'sent' | 'failed';

export type PostMessage = {
  senderId: string;
  type: 'post';
  text: string | string[];
  repliesToMessageId?: string;
  embeddedMedia?: Array<{
    type: string;
    key: string;
    data: string;
    mimeType: string;
  }>;
};

// Space profile-update broadcast. Per-field semantics mirror bio: an omitted
// field means "no change", an explicit empty string is a deliberate clear.
// `displayName` here is the sender's per-space name (an optional override of
// their global account name) — clearing it falls back to the global / QNS name.
// It is intentionally optional and NOT the global display name (that lives on
// UserProfile / PublicProfile and stays required).
export type UpdateProfileMessage = {
  senderId: string;
  type: 'update-profile';
  displayName?: string;
  userIcon: string;
  bio?: string;
  spaceTag?: BroadcastSpaceTag;
};

// DM equivalent of UpdateProfileMessage. Intercepted before persistence
// (never renders as a chat post) and upserts the DM conversation row.
// Empty/absent fields mean "no change"; explicit empty-string bio clears,
// matching space update-profile semantics.
export type DMUpdateProfileMessage = {
  senderId: string;
  type: 'dm-update-profile';
  displayName?: string;
  userIcon?: string;
  bio?: string;
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

// Sent to your OWN other devices to wipe the whole conversation locally.
// Distinct from delete-conversation (targets the counterparty, only resets their
// session). conversationAddress = the counterparty to remove; E2E-encrypted to
// your own devices, which already know it.
export type DeleteConversationSelfMessage = {
  senderId: string;
  type: 'delete-conversation-self';
  conversationAddress: string;
};

export type EditMessage = {
  senderId: string;
  type: 'edit-message';
  originalMessageId: string;
  editedText: string | string[];
  editedAt: number;
  editNonce: string;
  editSignature?: string;
  mentions?: Mentions;
};

export type ThreadMeta = {
  threadId: string;
  createdBy: string;
  customTitle?: string;
  isClosed?: boolean;
  closedBy?: string;
  autoCloseAfter?: number;
  lastActivityAt?: number;
};

export type ThreadMessage = {
  senderId: string;
  type: 'thread';
  targetMessageId: string;
  action: 'create' | 'updateTitle' | 'close' | 'reopen' | 'updateSettings' | 'remove';
  threadMeta: ThreadMeta;
};

export type ChannelThread = {
  threadId: string;
  spaceId: string;
  channelId: string;
  rootMessageId: string;
  createdBy: string;
  createdAt: number;
  lastActivityAt: number;
  replyCount: number;
  isClosed: boolean;
  customTitle?: string;
  titleSnapshot?: string;
  hasParticipated: boolean;
};

export type CallOfferMessage = {
  senderId: string;
  type: 'call-offer';
  callId: string;
  sdp: string;
  mediaType: 'audio' | 'video';
  relayCredentials: {
    username: string;
    password: string;
    turnUrls: string[];
    ttl: number;
  };
  circuitId: string;
};

export type CallAnswerMessage = {
  senderId: string;
  type: 'call-answer';
  callId: string;
  sdp: string;
};

export type CallRejectMessage = {
  senderId: string;
  type: 'call-reject';
  callId: string;
  reason: 'declined' | 'busy' | 'unavailable' | 'timeout';
};

export type CallHangupMessage = {
  senderId: string;
  type: 'call-hangup';
  callId: string;
};

export type CallEventMessage = {
  senderId: string;
  type: 'call-event';
  callId: string;
  mediaType: 'audio' | 'video';
  event: 'completed' | 'missed' | 'declined' | 'failed';
  duration?: number;
};

export type CallIceCandidateMessage = {
  senderId: string;
  type: 'call-ice-candidate';
  callId: string;
  candidate: string;
};

export type CallRenegotiateMessage = {
  senderId: string;
  type: 'call-renegotiate';
  callId: string;
  sdp: string;
  relayCredentials: {
    username: string;
    password: string;
    turnUrls: string[];
    ttl: number;
  };
};

export type SpaceCallStartMessage = {
  senderId: string;
  type: 'space-call-start';
  callId: string;
  mediaType: 'audio' | 'video';
};

export type SpaceCallEndMessage = {
  senderId: string;
  type: 'space-call-end';
  callId: string;
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
  | DeleteConversationSelfMessage
  | EditMessage
  | CallOfferMessage
  | CallAnswerMessage
  | CallRejectMessage
  | CallHangupMessage
  | CallIceCandidateMessage
  | CallEventMessage
  | CallRenegotiateMessage
  | SpaceCallStartMessage
  | SpaceCallEndMessage
  | ThreadMessage;

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
  threadMeta?: ThreadMeta;
  threadId?: string;
  isThreadReply?: boolean;
  /** Timestamp when sender processed the incoming delivery ack (persisted to storage) */
  deliveredAt?: number;
  /** Timestamp when sender processed the incoming read ack (persisted to storage) */
  readAt?: number;
};
