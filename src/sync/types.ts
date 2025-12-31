/**
 * Sync Protocol Types
 *
 * Hash-based delta synchronization for efficient data transfer.
 * Reduces bandwidth by only sending data the recipient is missing.
 */

import type { Message, SpaceMember } from '../types';

// ============ Message Sync ============

/** Compact message reference for sync comparison */
export interface MessageDigest {
  /** Unique message identifier */
  messageId: string;
  /** Message creation timestamp */
  createdDate: number;
  /** SHA-256 hash of canonical message content */
  contentHash: string;
  /** Last modification timestamp (for detecting edits) */
  modifiedDate?: number;
}

/** Compact reaction reference for sync comparison */
export interface ReactionDigest {
  /** Message this reaction is on */
  messageId: string;
  /** Emoji/reaction identifier */
  emojiId: string;
  /** Number of users who reacted */
  count: number;
  /** Hash of sorted member IDs who reacted */
  membersHash: string;
}

/** Manifest of all messages in a channel */
export interface SyncManifest {
  spaceId: string;
  channelId: string;
  messageCount: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  /** Message digests sorted by createdDate ascending */
  digests: MessageDigest[];
  /** Reaction digests for quick comparison */
  reactionDigests: ReactionDigest[];
}

/** Delta response containing only needed messages */
export interface MessageDelta {
  spaceId: string;
  channelId: string;
  /** Messages the recipient is missing */
  newMessages: Message[];
  /** Messages that have been edited since recipient's version */
  updatedMessages: Message[];
  /** Message IDs that have been deleted (tombstones) */
  deletedMessageIds: string[];
}

/** Delta response for reactions only */
export interface ReactionDelta {
  spaceId: string;
  channelId: string;
  /** Reactions to add: { messageId, emojiId, memberIds[] } */
  added: Array<{
    messageId: string;
    emojiId: string;
    memberIds: string[];
  }>;
  /** Reactions to remove: { messageId, emojiId, memberIds[] } */
  removed: Array<{
    messageId: string;
    emojiId: string;
    memberIds: string[];
  }>;
}

// ============ Member Sync ============

/** Compact member reference */
export interface MemberDigest {
  /** User's address */
  address: string;
  /** User's inbox address */
  inboxAddress: string;
  /** SHA-256 hash of display_name (or empty string) */
  displayNameHash: string;
  /** SHA-256 hash of icon URL/data (or empty string) */
  iconHash: string;
}

/** Member delta containing only changes */
export interface MemberDelta {
  spaceId: string;
  /** New or updated members (full data) */
  members: SpaceMember[];
  /** Addresses of removed/kicked members */
  removedAddresses: string[];
}

// ============ Peer Map Sync ============

/** Peer map entry for Triple Ratchet */
export interface PeerEntry {
  /** Peer's ID in the ratchet */
  peerId: number;
  /** Peer's public key (hex or base64) */
  publicKey: string;
  /** Peer's identity public key (hex or base64) - optional for minimal sync */
  identityPublicKey?: string;
  /** Peer's signed pre-key (hex or base64) - optional for minimal sync */
  signedPrePublicKey?: string;
}

/** Peer map delta */
export interface PeerMapDelta {
  spaceId: string;
  /** New peer entries */
  added: PeerEntry[];
  /** Updated peer entries (changed keys) */
  updated: PeerEntry[];
  /** Removed peer IDs */
  removed: number[];
}

// ============ Deleted Message Tracking ============

/** Tombstone for a deleted message */
export interface DeletedMessageTombstone {
  messageId: string;
  spaceId: string;
  channelId: string;
  deletedAt: number;
}

// ============ Control Message Payloads ============

/** Summary of sync data for comparison */
export interface SyncSummary {
  memberCount: number;
  messageCount: number;
  newestMessageTimestamp: number;
  oldestMessageTimestamp: number;
  /** Hash of all message IDs for quick comparison */
  manifestHash?: string;
}

/** sync-request payload (broadcast via hub) */
export interface SyncRequestPayload {
  type: 'sync-request';
  /** Our inbox address for responses */
  inboxAddress: string;
  /** Request expiry timestamp */
  expiry: number;
  /** Summary of our data */
  summary: SyncSummary;
}

/** sync-info payload (direct to requester) */
export interface SyncInfoPayload {
  type: 'sync-info';
  /** Our inbox address */
  inboxAddress: string;
  /** Summary of our data */
  summary: SyncSummary;
}

/** sync-initiate payload (direct to best peer) */
export interface SyncInitiatePayload {
  type: 'sync-initiate';
  /** Our inbox address (for peer to send data back to) */
  inboxAddress: string;
  /** Our manifest for comparison */
  manifest?: SyncManifest;
  /** Our member digests for comparison */
  memberDigests?: MemberDigest[];
  /** Our peer IDs for comparison */
  peerIds?: number[];
}

/** sync-manifest payload (response to sync-initiate with our data summary) */
export interface SyncManifestPayload {
  type: 'sync-manifest';
  /** Our inbox address (for peer to send data back to) */
  inboxAddress: string;
  /** Our full manifest */
  manifest: SyncManifest;
  /** Our member digests */
  memberDigests: MemberDigest[];
  /** Our peer IDs */
  peerIds: number[];
}

/** sync-delta payload (actual data transfer) */
export interface SyncDeltaPayload {
  type: 'sync-delta';
  /** Message changes */
  messageDelta?: MessageDelta;
  /** Reaction changes (synced independently) */
  reactionDelta?: ReactionDelta;
  /** Member changes */
  memberDelta?: MemberDelta;
  /** Peer map changes */
  peerMapDelta?: PeerMapDelta;
  /** Whether this is the final delta chunk */
  isFinal?: boolean;
}

// ============ Sync State ============

/** Candidate from sync-info response */
export interface SyncCandidate {
  inboxAddress: string;
  summary: SyncSummary;
}

/** Active sync session state */
export interface SyncSession {
  spaceId: string;
  channelId: string;
  /** Request expiry timestamp */
  expiry: number;
  /** Candidates who responded to sync-request */
  candidates: SyncCandidate[];
  /** Timeout handle for initiating sync */
  timeout?: ReturnType<typeof setTimeout>;
  /** Whether sync is in progress */
  inProgress: boolean;
  /** Target inbox address when we've initiated sync */
  syncTarget?: string;
}

// ============ Union Types ============

/** All sync control message payloads */
export type SyncControlPayload =
  | SyncRequestPayload
  | SyncInfoPayload
  | SyncInitiatePayload
  | SyncManifestPayload
  | SyncDeltaPayload;

/** Type guard for sync-request */
export function isSyncRequest(payload: SyncControlPayload): payload is SyncRequestPayload {
  return payload.type === 'sync-request';
}

/** Type guard for sync-info */
export function isSyncInfo(payload: SyncControlPayload): payload is SyncInfoPayload {
  return payload.type === 'sync-info';
}

/** Type guard for sync-initiate */
export function isSyncInitiate(payload: SyncControlPayload): payload is SyncInitiatePayload {
  return payload.type === 'sync-initiate';
}

/** Type guard for sync-manifest */
export function isSyncManifest(payload: SyncControlPayload): payload is SyncManifestPayload {
  return payload.type === 'sync-manifest';
}

/** Type guard for sync-delta */
export function isSyncDelta(payload: SyncControlPayload): payload is SyncDeltaPayload {
  return payload.type === 'sync-delta';
}
