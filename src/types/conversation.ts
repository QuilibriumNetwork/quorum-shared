/**
 * Conversation (DM) types for Quorum
 */

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
};
