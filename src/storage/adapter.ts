/**
 * StorageAdapter interface
 *
 * Platform-agnostic storage interface that can be implemented by:
 * - IndexedDB (desktop/web)
 * - MMKV (React Native mobile)
 */

import type { Space, Channel, Message, Conversation, UserConfig, SpaceMember } from '../types';
import type { MessageDigest, MemberDigest, DeletedMessageTombstone } from '../sync/types';

export interface GetMessagesParams {
  spaceId: string;
  channelId: string;
  cursor?: number;
  direction?: 'forward' | 'backward';
  limit?: number;
}

export interface GetMessagesResult {
  messages: Message[];
  nextCursor: number | null;
  prevCursor: number | null;
}

export interface StorageAdapter {
  // Initialization
  init(): Promise<void>;

  // Spaces
  getSpaces(): Promise<Space[]>;
  getSpace(spaceId: string): Promise<Space | null>;
  saveSpace(space: Space): Promise<void>;
  deleteSpace(spaceId: string): Promise<void>;

  // Channels (embedded in Space, but may need separate access)
  getChannels(spaceId: string): Promise<Channel[]>;

  // Messages
  getMessages(params: GetMessagesParams): Promise<GetMessagesResult>;
  getMessage(params: {
    spaceId: string;
    channelId: string;
    messageId: string;
  }): Promise<Message | undefined>;
  saveMessage(
    message: Message,
    lastMessageTimestamp: number,
    address: string,
    conversationType: string,
    icon: string,
    displayName: string
  ): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;

  // Conversations (DMs)
  getConversations(params: {
    type: 'direct' | 'group';
    cursor?: number;
    limit?: number;
  }): Promise<{ conversations: Conversation[]; nextCursor: number | null }>;
  getConversation(conversationId: string): Promise<Conversation | undefined>;
  saveConversation(conversation: Conversation): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;

  // User Config
  getUserConfig(address: string): Promise<UserConfig | undefined>;
  saveUserConfig(userConfig: UserConfig): Promise<void>;

  // Space Members
  getSpaceMembers(spaceId: string): Promise<SpaceMember[]>;
  getSpaceMember(spaceId: string, address: string): Promise<SpaceMember | undefined>;
  saveSpaceMember(spaceId: string, member: SpaceMember): Promise<void>;

  // Sync metadata
  getLastSyncTime(key: string): Promise<number | undefined>;
  setLastSyncTime(key: string, time: number): Promise<void>;

  // Sync-specific queries (optional - for optimized sync)
  // If not implemented, SyncService will compute these from full data

  /**
   * Get message digests for efficient sync comparison.
   * If not implemented, returns undefined and SyncService computes from messages.
   */
  getMessageDigests?(spaceId: string, channelId: string): Promise<MessageDigest[] | undefined>;

  /**
   * Get messages by IDs for delta sync.
   * If not implemented, returns undefined and caller fetches individually.
   */
  getMessagesByIds?(
    spaceId: string,
    channelId: string,
    ids: string[]
  ): Promise<Message[] | undefined>;

  /**
   * Get member digests for efficient sync comparison.
   * If not implemented, returns undefined and SyncService computes from members.
   */
  getMemberDigests?(spaceId: string): Promise<MemberDigest[] | undefined>;

  /**
   * Get deleted message tombstones for sync.
   */
  getTombstones?(spaceId: string, channelId: string): Promise<DeletedMessageTombstone[]>;

  /**
   * Save deleted message tombstone.
   */
  saveTombstone?(tombstone: DeletedMessageTombstone): Promise<void>;

  /**
   * Clean up old tombstones.
   */
  cleanupTombstones?(maxAgeMs: number): Promise<void>;
}
