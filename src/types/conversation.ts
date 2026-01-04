/**
 * Conversation (DM) types for Quorum
 */

export type ConversationSource = 'quorum' | 'farcaster';

export type Conversation = {
  conversationId: string;
  type: 'direct' | 'group';
  timestamp: number;
  address: string;
  icon: string;
  displayName: string;
  lastReadTimestamp?: number;
  isRepudiable?: boolean;
  saveEditHistory?: boolean;
  lastMessageId?: string;
  // Farcaster-specific fields
  source?: ConversationSource;  // 'quorum' (E2EE) or 'farcaster' (direct cast)
  farcasterConversationId?: string;  // Farcaster conversation ID (e.g., "123-456")
  farcasterFid?: number;  // Counterparty's Farcaster FID (for 1:1 DMs)
  farcasterUsername?: string;  // Counterparty's Farcaster username
  farcasterParticipantFids?: number[];  // All participant FIDs except current user (for group chats)
  unreadCount?: number;  // Farcaster unread count
};
