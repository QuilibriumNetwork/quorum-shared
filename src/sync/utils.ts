/**
 * Sync Utility Functions
 *
 * Hash computation, digest creation, and delta calculation for sync protocol.
 */

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '../utils/encoding';
import type { Message, SpaceMember, Reaction } from '../types';
import type {
  MessageDigest,
  ReactionDigest,
  SyncManifest,
  MessageDelta,
  ReactionDelta,
  MemberDigest,
  MemberDelta,
  DeletedMessageTombstone,
} from './types';

// ============ Constants ============

/** Maximum chunk size for message transmission (5MB) */
export const MAX_CHUNK_SIZE = 5 * 1024 * 1024;

/** Default sync request expiry (30 seconds) */
export const DEFAULT_SYNC_EXPIRY_MS = 30000;

/** Aggressive sync timeout after receiving first response (1 second) */
export const AGGRESSIVE_SYNC_TIMEOUT_MS = 1000;

// ============ Hash Functions ============

/**
 * Compute SHA-256 hash of a string
 */
export function computeHash(data: string): string {
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Compute hash of message content for comparison.
 * Uses canonical representation: senderId + type + content-specific fields
 */
export function computeContentHash(message: Message): string {
  const content = message.content;
  let canonical = `${content.senderId}:${content.type}`;

  switch (content.type) {
    case 'post':
      canonical += `:${Array.isArray(content.text) ? content.text.join('\n') : content.text}`;
      if (content.repliesToMessageId) {
        canonical += `:reply:${content.repliesToMessageId}`;
      }
      break;

    case 'embed':
      canonical += `:${content.imageUrl || ''}:${content.videoUrl || ''}`;
      if (content.repliesToMessageId) {
        canonical += `:reply:${content.repliesToMessageId}`;
      }
      break;

    case 'sticker':
      canonical += `:${content.stickerId}`;
      if (content.repliesToMessageId) {
        canonical += `:reply:${content.repliesToMessageId}`;
      }
      break;

    case 'edit-message':
      canonical += `:${content.originalMessageId}:${Array.isArray(content.editedText) ? content.editedText.join('\n') : content.editedText}:${content.editedAt}`;
      break;

    case 'remove-message':
      canonical += `:${content.removeMessageId}`;
      break;

    case 'join':
    case 'leave':
    case 'kick':
      // No additional content
      break;

    case 'event':
      canonical += `:${content.text}`;
      break;

    case 'update-profile':
      canonical += `:${content.displayName}:${content.userIcon}`;
      break;

    case 'mute':
      canonical += `:${content.targetUserId}:${content.action}:${content.muteId}`;
      break;

    case 'pin':
      canonical += `:${content.targetMessageId}:${content.action}`;
      break;

    case 'reaction':
    case 'remove-reaction':
      canonical += `:${content.messageId}:${content.reaction}`;
      break;

    case 'delete-conversation':
      // No additional content
      break;
  }

  return computeHash(canonical);
}

/**
 * Compute hash of reaction state for a message
 */
export function computeReactionHash(reactions: Reaction[]): string {
  if (!reactions || reactions.length === 0) {
    return computeHash('');
  }

  // Sort reactions by emojiId for deterministic hash
  const sorted = [...reactions].sort((a, b) => a.emojiId.localeCompare(b.emojiId));

  // Create canonical representation
  const canonical = sorted
    .map((r) => {
      const sortedMembers = [...r.memberIds].sort();
      return `${r.emojiId}:${sortedMembers.join(',')}`;
    })
    .join('|');

  return computeHash(canonical);
}

/**
 * Compute hash of member's mutable fields
 */
export function computeMemberHash(member: SpaceMember): {
  displayNameHash: string;
  iconHash: string;
} {
  const displayNameHash = computeHash(member.display_name || '');
  const iconHash = computeHash(member.profile_image || '');
  return { displayNameHash, iconHash };
}

/**
 * Compute manifest hash for quick comparison.
 * Hash of sorted message IDs.
 */
export function computeManifestHash(digests: MessageDigest[]): string {
  if (digests.length === 0) {
    return computeHash('');
  }

  // Sort by messageId for deterministic hash
  const sorted = [...digests].sort((a, b) => a.messageId.localeCompare(b.messageId));
  const ids = sorted.map((d) => d.messageId).join(':');
  return computeHash(ids);
}

// ============ Digest Creation ============

/**
 * Create digest from message
 */
export function createMessageDigest(message: Message): MessageDigest {
  return {
    messageId: message.messageId,
    createdDate: message.createdDate,
    contentHash: computeContentHash(message),
    modifiedDate: message.modifiedDate !== message.createdDate ? message.modifiedDate : undefined,
  };
}

/**
 * Create reaction digest for a message
 */
export function createReactionDigest(
  messageId: string,
  reactions: Reaction[]
): ReactionDigest[] {
  if (!reactions || reactions.length === 0) {
    return [];
  }

  return reactions.map((r) => ({
    messageId,
    emojiId: r.emojiId,
    count: r.count,
    membersHash: computeHash([...r.memberIds].sort().join(',')),
  }));
}

/**
 * Create manifest from messages
 */
export function createManifest(
  spaceId: string,
  channelId: string,
  messages: Message[]
): SyncManifest {
  // Sort by createdDate ascending
  const sorted = [...messages].sort((a, b) => a.createdDate - b.createdDate);
  const digests = sorted.map(createMessageDigest);

  // Collect all reaction digests
  const reactionDigests: ReactionDigest[] = [];
  for (const msg of sorted) {
    if (msg.reactions && msg.reactions.length > 0) {
      reactionDigests.push(...createReactionDigest(msg.messageId, msg.reactions));
    }
  }

  return {
    spaceId,
    channelId,
    messageCount: messages.length,
    oldestTimestamp: sorted[0]?.createdDate || 0,
    newestTimestamp: sorted[sorted.length - 1]?.createdDate || 0,
    digests,
    reactionDigests,
  };
}

/**
 * Create member digest
 */
export function createMemberDigest(member: SpaceMember): MemberDigest {
  const { displayNameHash, iconHash } = computeMemberHash(member);
  return {
    address: member.address,
    inboxAddress: member.inbox_address || '',
    displayNameHash,
    iconHash,
  };
}

// ============ Delta Calculation ============

export interface MessageDiffResult {
  /** Message IDs we don't have */
  missingIds: string[];
  /** Message IDs we have but are outdated (content changed) */
  outdatedIds: string[];
  /** Message IDs we have but they don't (we should send to them) */
  extraIds: string[];
}

/**
 * Compare manifests and determine what messages differ
 */
export function computeMessageDiff(
  ourManifest: SyncManifest,
  theirManifest: SyncManifest
): MessageDiffResult {
  const ourDigests = new Map(ourManifest.digests.map((d) => [d.messageId, d]));
  const theirDigests = new Map(theirManifest.digests.map((d) => [d.messageId, d]));

  const missingIds: string[] = [];
  const outdatedIds: string[] = [];
  const extraIds: string[] = [];

  // Find messages we're missing or that are outdated in our copy
  for (const [id, theirDigest] of theirDigests) {
    const ourDigest = ourDigests.get(id);
    if (!ourDigest) {
      missingIds.push(id);
    } else if (ourDigest.contentHash !== theirDigest.contentHash) {
      // Content differs - check which is newer
      const theirModified = theirDigest.modifiedDate || theirDigest.createdDate;
      const ourModified = ourDigest.modifiedDate || ourDigest.createdDate;
      if (theirModified > ourModified) {
        outdatedIds.push(id);
      }
    }
  }

  // Find messages we have that they don't
  for (const [id] of ourDigests) {
    if (!theirDigests.has(id)) {
      extraIds.push(id);
    }
  }

  return { missingIds, outdatedIds, extraIds };
}

export interface ReactionDiffResult {
  /** Reactions to add: { messageId, emojiId, memberIds to add } */
  toAdd: Array<{ messageId: string; emojiId: string; memberIds: string[] }>;
  /** Reactions to remove: { messageId, emojiId, memberIds to remove } */
  toRemove: Array<{ messageId: string; emojiId: string; memberIds: string[] }>;
}

/**
 * Compare reaction digests and determine differences.
 * This requires the full reaction data to compute actual member diffs.
 */
export function computeReactionDiff(
  ourReactions: Map<string, Reaction[]>, // messageId -> reactions
  theirDigests: ReactionDigest[]
): ReactionDiffResult {
  const toAdd: ReactionDiffResult['toAdd'] = [];
  const toRemove: ReactionDiffResult['toRemove'] = [];

  // Group their digests by messageId
  const theirByMessage = new Map<string, ReactionDigest[]>();
  for (const digest of theirDigests) {
    const existing = theirByMessage.get(digest.messageId) || [];
    existing.push(digest);
    theirByMessage.set(digest.messageId, existing);
  }

  // Compare each message's reactions
  for (const [messageId, theirMsgDigests] of theirByMessage) {
    const ourMsgReactions = ourReactions.get(messageId) || [];
    const ourByEmoji = new Map(ourMsgReactions.map((r) => [r.emojiId, r]));

    for (const theirDigest of theirMsgDigests) {
      const ourReaction = ourByEmoji.get(theirDigest.emojiId);
      if (!ourReaction) {
        // We're missing this entire reaction - but we don't have the memberIds
        // This will be resolved when we receive the full reaction data
        continue;
      }

      // Check if members hash differs
      const ourMembersHash = computeHash([...ourReaction.memberIds].sort().join(','));
      if (ourMembersHash !== theirDigest.membersHash) {
        // Reactions differ - we'll need to reconcile when we get full data
        // For now, mark as needing update
      }
    }
  }

  return { toAdd, toRemove };
}

export interface MemberDiffResult {
  /** Member addresses we don't have */
  missingAddresses: string[];
  /** Member addresses where our data is outdated */
  outdatedAddresses: string[];
  /** Member addresses we have that they don't */
  extraAddresses: string[];
}

/**
 * Compare member digests and determine differences
 */
export function computeMemberDiff(
  ourDigests: MemberDigest[],
  theirDigests: MemberDigest[]
): MemberDiffResult {
  const ourMap = new Map(ourDigests.map((d) => [d.address, d]));
  const theirMap = new Map(theirDigests.map((d) => [d.address, d]));

  const missingAddresses: string[] = [];
  const outdatedAddresses: string[] = [];
  const extraAddresses: string[] = [];

  for (const [address, theirDigest] of theirMap) {
    const ourDigest = ourMap.get(address);
    if (!ourDigest) {
      missingAddresses.push(address);
    } else if (
      ourDigest.displayNameHash !== theirDigest.displayNameHash ||
      ourDigest.iconHash !== theirDigest.iconHash
    ) {
      outdatedAddresses.push(address);
    }
  }

  // Find members we have that they don't
  for (const [address] of ourMap) {
    if (!theirMap.has(address)) {
      extraAddresses.push(address);
    }
  }

  return { missingAddresses, outdatedAddresses, extraAddresses };
}

export interface PeerDiffResult {
  /** Peer IDs they have that we don't */
  missingPeerIds: number[];
  /** Peer IDs we have that they don't */
  extraPeerIds: number[];
}

/**
 * Compare peer ID sets
 */
export function computePeerDiff(ourPeerIds: number[], theirPeerIds: number[]): PeerDiffResult {
  const ourSet = new Set(ourPeerIds);
  const theirSet = new Set(theirPeerIds);

  const missingPeerIds = theirPeerIds.filter((id) => !ourSet.has(id));
  const extraPeerIds = ourPeerIds.filter((id) => !theirSet.has(id));

  return { missingPeerIds, extraPeerIds };
}

// ============ Delta Building ============

/**
 * Build message delta from diff result and message lookup
 */
export function buildMessageDelta(
  spaceId: string,
  channelId: string,
  diff: MessageDiffResult,
  messageMap: Map<string, Message>,
  tombstones: DeletedMessageTombstone[]
): MessageDelta {
  const newMessages = diff.extraIds
    .map((id) => messageMap.get(id))
    .filter((m): m is Message => m !== undefined);

  const updatedMessages = diff.outdatedIds
    .map((id) => messageMap.get(id))
    .filter((m): m is Message => m !== undefined);

  // Filter tombstones for this channel
  const deletedMessageIds = tombstones
    .filter((t) => t.spaceId === spaceId && t.channelId === channelId)
    .map((t) => t.messageId);

  return {
    spaceId,
    channelId,
    newMessages,
    updatedMessages,
    deletedMessageIds,
  };
}

/**
 * Build reaction delta for messages
 */
export function buildReactionDelta(
  spaceId: string,
  channelId: string,
  messageMap: Map<string, Message>,
  messageIds: string[]
): ReactionDelta {
  const added: ReactionDelta['added'] = [];

  for (const messageId of messageIds) {
    const message = messageMap.get(messageId);
    if (message?.reactions) {
      for (const reaction of message.reactions) {
        added.push({
          messageId,
          emojiId: reaction.emojiId,
          memberIds: reaction.memberIds,
        });
      }
    }
  }

  return {
    spaceId,
    channelId,
    added,
    removed: [], // Removed reactions are harder to track without explicit tombstones
  };
}

/**
 * Build member delta from diff result and member lookup
 */
export function buildMemberDelta(
  spaceId: string,
  diff: MemberDiffResult,
  memberMap: Map<string, SpaceMember>
): MemberDelta {
  const addresses = [...diff.missingAddresses, ...diff.outdatedAddresses];
  const members = addresses
    .map((addr) => memberMap.get(addr))
    .filter((m): m is SpaceMember => m !== undefined);

  return {
    spaceId,
    members,
    removedAddresses: [], // Would need explicit tracking
  };
}

// ============ Chunking ============

/**
 * Chunk messages for transmission to stay under size limit
 */
export function chunkMessages(messages: Message[]): Message[][] {
  const chunks: Message[][] = [];
  let currentChunk: Message[] = [];
  let currentSize = 0;

  for (const msg of messages) {
    const msgSize = JSON.stringify(msg).length;

    // If single message exceeds limit, send it alone
    if (msgSize > MAX_CHUNK_SIZE) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }
      chunks.push([msg]);
      continue;
    }

    // Check if adding this message would exceed limit
    if (currentSize + msgSize > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(msg);
    currentSize += msgSize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Chunk members for transmission
 */
export function chunkMembers(members: SpaceMember[]): SpaceMember[][] {
  const chunks: SpaceMember[][] = [];
  let currentChunk: SpaceMember[] = [];
  let currentSize = 0;

  for (const member of members) {
    const memberSize = JSON.stringify(member).length;

    if (currentSize + memberSize > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(member);
    currentSize += memberSize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// ============ Summary Helpers ============

/**
 * Create sync summary from messages and members
 */
export function createSyncSummary(
  messages: Message[],
  memberCount: number
): {
  memberCount: number;
  messageCount: number;
  newestMessageTimestamp: number;
  oldestMessageTimestamp: number;
  manifestHash: string;
} {
  const digests = messages.map(createMessageDigest);
  const sorted = [...messages].sort((a, b) => a.createdDate - b.createdDate);

  return {
    memberCount,
    messageCount: messages.length,
    newestMessageTimestamp: sorted[sorted.length - 1]?.createdDate || 0,
    oldestMessageTimestamp: sorted[0]?.createdDate || 0,
    manifestHash: computeManifestHash(digests),
  };
}
