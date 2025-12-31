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
