/**
 * Sync Module
 *
 * Hash-based delta synchronization for efficient data transfer.
 */

// Types
export type {
  // Message sync
  MessageDigest,
  ReactionDigest,
  SyncManifest,
  MessageDelta,
  ReactionDelta,
  // Member sync
  MemberDigest,
  MemberDelta,
  // Peer map sync
  PeerEntry,
  PeerMapDelta,
  // Tombstones
  DeletedMessageTombstone,
  // Control messages
  SyncSummary,
  SyncRequestPayload,
  SyncInfoPayload,
  SyncInitiatePayload,
  SyncManifestPayload,
  SyncDeltaPayload,
  // State
  SyncCandidate,
  SyncSession,
  // Union
  SyncControlPayload,
} from './types';

// Type guards
export {
  isSyncRequest,
  isSyncInfo,
  isSyncInitiate,
  isSyncManifest,
  isSyncDelta,
} from './types';

// Utils
export {
  // Constants
  MAX_CHUNK_SIZE,
  DEFAULT_SYNC_EXPIRY_MS,
  AGGRESSIVE_SYNC_TIMEOUT_MS,
  SYNC_MESSAGE_WEIGHT,
  SYNC_MEMBER_WEIGHT,
  MAX_PLAUSIBLE_SYNC_COUNT,
  // Wire-value sanitation — exported because BOTH apps have to apply the same
  // floor and ceiling to a peer's self-reported counts. Two private copies of
  // this rule would drift, and the ceiling in particular only works if
  // everybody agrees on it.
  advertisedCount,
  // Hash functions
  computeHash,
  computeContentHash,
  computeReactionHash,
  computeMemberHash,
  computeManifestHash,
  // Digest creation
  createMessageDigest,
  createReactionDigest,
  createManifest,
  createMemberDigest,
  // Delta calculation
  computeMessageDiff,
  computeReactionDiff,
  computeMemberDiff,
  computePeerDiff,
  // Delta building
  buildMessageDelta,
  buildReactionDelta,
  buildMemberDelta,
  // Chunking
  chunkMessages,
  chunkMembers,
  // Summary
  createSyncSummary,
} from './utils';

export type { MessageDiffResult, ReactionDiffResult, MemberDiffResult, PeerDiffResult } from './utils';

// Service
export { SyncService } from './service';
export type { SyncServiceConfig } from './service';
