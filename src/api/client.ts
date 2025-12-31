/**
 * QuorumApiClient interface
 *
 * Platform-agnostic API client that can be implemented differently
 * for mobile (fetch) and desktop (Electron IPC or fetch)
 */

import type { Space, Message, Conversation } from '../types';

export interface SendMessageParams {
  spaceId: string;
  channelId: string;
  text: string;
  repliesToMessageId?: string;
}

export interface AddReactionParams {
  spaceId: string;
  channelId: string;
  messageId: string;
  reaction: string;
}

export interface RemoveReactionParams {
  spaceId: string;
  channelId: string;
  messageId: string;
  reaction: string;
}

export interface EditMessageParams {
  spaceId: string;
  channelId: string;
  messageId: string;
  text: string;
}

export interface DeleteMessageParams {
  spaceId: string;
  channelId: string;
  messageId: string;
}

export interface SendDirectMessageParams {
  conversationId: string;
  text: string;
  repliesToMessageId?: string;
}

export interface QuorumApiClient {
  // Spaces
  fetchSpaces(): Promise<Space[]>;
  fetchSpace(spaceId: string): Promise<Space>;
  joinSpace(inviteCode: string): Promise<Space>;

  // Messages
  fetchMessages(params: {
    spaceId: string;
    channelId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ messages: Message[]; nextPageToken?: string }>;

  sendMessage(params: SendMessageParams): Promise<Message>;
  editMessage(params: EditMessageParams): Promise<Message>;
  deleteMessage(params: DeleteMessageParams): Promise<void>;

  // Reactions
  addReaction(params: AddReactionParams): Promise<void>;
  removeReaction(params: RemoveReactionParams): Promise<void>;

  // Conversations
  fetchConversations(): Promise<Conversation[]>;
  createConversation(params: { address: string }): Promise<Conversation>;
  sendDirectMessage(params: SendDirectMessageParams): Promise<Message>;
  fetchDirectMessages(params: {
    conversationId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ messages: Message[]; nextPageToken?: string }>;

  // Pinning
  pinMessage(params: { spaceId: string; channelId: string; messageId: string }): Promise<void>;
  unpinMessage(params: { spaceId: string; channelId: string; messageId: string }): Promise<void>;
}

