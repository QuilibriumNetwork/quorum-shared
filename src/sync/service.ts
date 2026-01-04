/**
 * SyncService
 *
 * Platform-agnostic sync orchestration logic.
 * Handles sync protocol without encryption (that's platform-specific).
 *
 * Usage:
 * 1. Platform creates SyncService with storage adapter
 * 2. Platform calls build* methods to create payloads
 * 3. Platform handles encryption and transmission
 * 4. Platform calls apply* methods to process received data
 */

import type { StorageAdapter } from '../storage';
import type { Message, SpaceMember } from '../types';
import { logger } from '../utils/logger';
import type {
  SyncManifest,
  MessageDelta,
  ReactionDelta,
  MemberDigest,
  MemberDelta,
  PeerEntry,
  PeerMapDelta,
  SyncRequestPayload,
  SyncInfoPayload,
  SyncInitiatePayload,
  SyncManifestPayload,
  SyncDeltaPayload,
  SyncSession,
  SyncCandidate,
  SyncSummary,
  DeletedMessageTombstone,
} from './types';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '../utils/encoding';
import {
  createManifest,
  createMessageDigest,
  createMemberDigest,
  createReactionDigest,
  computeMessageDiff,
  computeMemberDiff,
  computePeerDiff,
  buildMessageDelta,
  buildReactionDelta,
  buildMemberDelta,
  chunkMessages,
  DEFAULT_SYNC_EXPIRY_MS,
  AGGRESSIVE_SYNC_TIMEOUT_MS,
} from './utils';

// ============ Configuration ============

export interface SyncServiceConfig {
  storage: StorageAdapter;
  /** Maximum messages to include in sync (default: 1000) */
  maxMessages?: number;
  /** Sync request expiry in ms (default: 30000) */
  requestExpiry?: number;
  /** Callback when sync should be initiated */
  onInitiateSync?: (spaceId: string, target: string) => void;
  /** Cache TTL in ms (default: 5000) */
  cacheTtl?: number;
}

// ============ Cache Types ============

interface SyncPayloadCache {
  /** Space and channel IDs */
  spaceId: string;
  channelId: string;
  /** Message map for delta building - O(1) lookup */
  messageMap: Map<string, Message>;
  /** Member map for delta building - O(1) lookup */
  memberMap: Map<string, SpaceMember>;
  /** Message digest map - O(1) lookup/update */
  digestMap: Map<string, MessageDigest>;
  /** Member digest map - O(1) lookup/update */
  memberDigestMap: Map<string, MemberDigest>;
  /** Tracked timestamps for O(1) summary updates */
  oldestTimestamp: number;
  newestTimestamp: number;
  /** XOR-based manifest hash bytes for O(1) incremental updates */
  manifestHashBytes: Uint8Array;
}

// ============ SyncService Class ============

export class SyncService {
  private storage: StorageAdapter;
  private maxMessages: number;
  private requestExpiry: number;
  private onInitiateSync?: (spaceId: string, target: string) => void;

  /** Active sync sessions by spaceId */
  private sessions: Map<string, SyncSession> = new Map();

  /** Deleted message tombstones (caller must persist these) */
  private tombstones: DeletedMessageTombstone[] = [];

  /** Pre-computed sync payload cache per space:channel - always ready to use */
  private payloadCache: Map<string, SyncPayloadCache> = new Map();

  constructor(config: SyncServiceConfig) {
    this.storage = config.storage;
    this.maxMessages = config.maxMessages ?? 1000;
    this.requestExpiry = config.requestExpiry ?? DEFAULT_SYNC_EXPIRY_MS;
    this.onInitiateSync = config.onInitiateSync;
  }

  // ============ Payload Cache Management ============

  /**
   * Get cache key for space/channel
   */
  private getCacheKey(spaceId: string, channelId: string): string {
    return `${spaceId}:${channelId}`;
  }

  /**
   * Get or initialize the payload cache for a space/channel.
   * If not cached, loads from storage and builds the payload once.
   */
  private async getPayloadCache(spaceId: string, channelId: string): Promise<SyncPayloadCache> {
    const key = this.getCacheKey(spaceId, channelId);
    const cached = this.payloadCache.get(key);

    if (cached) {
      logger.log(`[SyncService] Using cached payload for ${spaceId.substring(0, 12)}:${channelId.substring(0, 12)}`);
      return cached;
    }

    // Initial load from storage - this only happens once per space/channel
    logger.log(`[SyncService] Building initial payload cache for ${spaceId.substring(0, 12)}:${channelId.substring(0, 12)}`);
    const messages = await this.getChannelMessages(spaceId, channelId);
    const members = await this.storage.getSpaceMembers(spaceId);

    const payload = this.buildPayloadCache(spaceId, channelId, messages, members);
    this.payloadCache.set(key, payload);

    return payload;
  }

  /**
   * Hash a message ID to bytes for XOR-based manifest hash
   */
  private hashMessageId(messageId: string): Uint8Array {
    return sha256(new TextEncoder().encode(messageId));
  }

  /**
   * XOR hash bytes into the accumulator - O(1)
   */
  private xorIntoHash(accumulator: Uint8Array, hash: Uint8Array): void {
    for (let i = 0; i < 32; i++) {
      accumulator[i] ^= hash[i];
    }
  }

  /**
   * Build the payload cache from messages and members - O(n) initial build
   */
  private buildPayloadCache(
    spaceId: string,
    channelId: string,
    messages: Message[],
    members: SpaceMember[]
  ): SyncPayloadCache {
    const messageMap = new Map(messages.map(m => [m.messageId, m]));
    const memberMap = new Map(members.map(m => [m.address, m]));
    const digestMap = new Map(messages.map(m => [m.messageId, createMessageDigest(m)]));
    const memberDigestMap = new Map(members.map(m => [m.address, createMemberDigest(m)]));

    // Compute timestamps
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;
    for (const msg of messages) {
      if (msg.createdDate < oldestTimestamp) oldestTimestamp = msg.createdDate;
      if (msg.createdDate > newestTimestamp) newestTimestamp = msg.createdDate;
    }
    if (messages.length === 0) {
      oldestTimestamp = 0;
    }

    // Compute XOR-based manifest hash - O(n) initial build
    const manifestHashBytes = new Uint8Array(32);
    for (const msg of messages) {
      this.xorIntoHash(manifestHashBytes, this.hashMessageId(msg.messageId));
    }

    return {
      spaceId,
      channelId,
      messageMap,
      memberMap,
      digestMap,
      memberDigestMap,
      oldestTimestamp,
      newestTimestamp,
      manifestHashBytes,
    };
  }

  /**
   * Get manifest hash as hex string - O(1)
   */
  private getManifestHash(cache: SyncPayloadCache): string {
    return bytesToHex(cache.manifestHashBytes);
  }

  /**
   * Get the manifest from cache - builds it on demand
   */
  private getManifest(cache: SyncPayloadCache): SyncManifest {
    const digests = [...cache.digestMap.values()].sort((a, b) => a.createdDate - b.createdDate);

    // Collect reaction digests
    const reactionDigests: ReturnType<typeof createReactionDigest> = [];
    for (const msg of cache.messageMap.values()) {
      if (msg.reactions && msg.reactions.length > 0) {
        reactionDigests.push(...createReactionDigest(msg.messageId, msg.reactions));
      }
    }

    return {
      spaceId: cache.spaceId,
      channelId: cache.channelId,
      messageCount: cache.digestMap.size,
      oldestTimestamp: cache.oldestTimestamp,
      newestTimestamp: cache.newestTimestamp,
      digests,
      reactionDigests,
    };
  }

  /**
   * Get the summary from cache - O(1)
   */
  private getSummary(cache: SyncPayloadCache): SyncSummary {
    return {
      memberCount: cache.memberDigestMap.size,
      messageCount: cache.digestMap.size,
      newestMessageTimestamp: cache.newestTimestamp,
      oldestMessageTimestamp: cache.oldestTimestamp,
      manifestHash: this.getManifestHash(cache),
    };
  }

  /**
   * Get member digests from cache - O(m)
   */
  private getMemberDigests(cache: SyncPayloadCache): MemberDigest[] {
    return [...cache.memberDigestMap.values()];
  }

  /**
   * Invalidate cache for a space/channel (forces reload from storage on next access)
   */
  invalidateCache(spaceId: string, channelId?: string): void {
    if (channelId) {
      const key = this.getCacheKey(spaceId, channelId);
      this.payloadCache.delete(key);
      logger.log(`[SyncService] Invalidated cache for ${spaceId.substring(0, 12)}:${channelId.substring(0, 12)}`);
    } else {
      // Invalidate all channels for this space
      for (const key of this.payloadCache.keys()) {
        if (key.startsWith(`${spaceId}:`)) {
          this.payloadCache.delete(key);
        }
      }
      logger.log(`[SyncService] Invalidated all caches for space ${spaceId.substring(0, 12)}`);
    }
  }

  /**
   * Update cache with a new/updated message - O(1) incremental update
   */
  updateCacheWithMessage(spaceId: string, channelId: string, message: Message): void {
    const key = this.getCacheKey(spaceId, channelId);
    const cached = this.payloadCache.get(key);

    if (cached) {
      const isNew = !cached.messageMap.has(message.messageId);

      // O(1) - update maps
      cached.messageMap.set(message.messageId, message);
      cached.digestMap.set(message.messageId, createMessageDigest(message));

      // O(1) - update timestamps if needed
      if (message.createdDate < cached.oldestTimestamp) {
        cached.oldestTimestamp = message.createdDate;
      }
      if (message.createdDate > cached.newestTimestamp) {
        cached.newestTimestamp = message.createdDate;
      }

      // O(1) - XOR in the new message ID hash (only for new messages)
      if (isNew) {
        this.xorIntoHash(cached.manifestHashBytes, this.hashMessageId(message.messageId));
      }

      logger.log(`[SyncService] Updated cache with message ${message.messageId.substring(0, 12)} (O(1))`);
    }
    // If no cache exists, next getPayloadCache call will load from storage
  }

  /**
   * Remove a message from cache - O(1) for removal, but may need O(n) for timestamp recalc
   */
  removeCacheMessage(spaceId: string, channelId: string, messageId: string): void {
    const key = this.getCacheKey(spaceId, channelId);
    const cached = this.payloadCache.get(key);

    if (cached) {
      const message = cached.messageMap.get(messageId);
      if (!message) return; // Message not in cache

      cached.messageMap.delete(messageId);
      cached.digestMap.delete(messageId);

      // O(1) - XOR out the removed message ID hash (XOR is its own inverse)
      this.xorIntoHash(cached.manifestHashBytes, this.hashMessageId(messageId));

      // Check if we need to recalculate timestamps (only if removed message was at boundary)
      if (message.createdDate === cached.oldestTimestamp || message.createdDate === cached.newestTimestamp) {
        // O(n) recalculation needed - but this is rare (only when deleting oldest/newest)
        this.recalculateTimestamps(cached);
      }

      logger.log(`[SyncService] Removed message ${messageId.substring(0, 12)} from cache`);
    }
  }

  /**
   * Recalculate timestamps from scratch - O(n), only called when necessary
   */
  private recalculateTimestamps(cache: SyncPayloadCache): void {
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    for (const msg of cache.messageMap.values()) {
      if (msg.createdDate < oldestTimestamp) oldestTimestamp = msg.createdDate;
      if (msg.createdDate > newestTimestamp) newestTimestamp = msg.createdDate;
    }

    cache.oldestTimestamp = cache.messageMap.size === 0 ? 0 : oldestTimestamp;
    cache.newestTimestamp = newestTimestamp;
  }

  /**
   * Update cache with a new/updated member - O(1) incremental update
   */
  updateCacheWithMember(spaceId: string, channelId: string, member: SpaceMember): void {
    const key = this.getCacheKey(spaceId, channelId);
    const cached = this.payloadCache.get(key);

    if (cached) {
      // O(1) - update maps
      cached.memberMap.set(member.address, member);
      cached.memberDigestMap.set(member.address, createMemberDigest(member));

      logger.log(`[SyncService] Updated cache with member ${member.address.substring(0, 12)} (O(1))`);
    }
  }

  /**
   * Check if cache exists for a space/channel
   */
  hasCachedPayload(spaceId: string, channelId: string): boolean {
    return this.payloadCache.has(this.getCacheKey(spaceId, channelId));
  }

  // ============ Session Management ============

  /**
   * Check if a sync session is active for a space
   */
  hasActiveSession(spaceId: string): boolean {
    const session = this.sessions.get(spaceId);
    if (!session) return false;
    if (Date.now() > session.expiry) {
      this.sessions.delete(spaceId);
      return false;
    }
    return true;
  }

  /**
   * Check if sync is in progress for a space
   */
  isSyncInProgress(spaceId: string): boolean {
    const session = this.sessions.get(spaceId);
    return session?.inProgress ?? false;
  }

  /**
   * Mark sync as in progress
   */
  setSyncInProgress(spaceId: string, inProgress: boolean): void {
    const session = this.sessions.get(spaceId);
    if (session) {
      session.inProgress = inProgress;
    }
  }

  /**
   * Set the sync target (who we're syncing with)
   */
  setSyncTarget(spaceId: string, targetInbox: string): void {
    const session = this.sessions.get(spaceId);
    if (session) {
      session.syncTarget = targetInbox;
    }
  }

  /**
   * Get the sync target for a space
   */
  getSyncTarget(spaceId: string): string | undefined {
    const session = this.sessions.get(spaceId);
    return session?.syncTarget;
  }

  // ============ Step 1: Sync Request ============

  /**
   * Build sync-request payload to broadcast via hub
   */
  async buildSyncRequest(
    spaceId: string,
    channelId: string,
    inboxAddress: string
  ): Promise<SyncRequestPayload> {
    const cache = await this.getPayloadCache(spaceId, channelId);
    const expiry = Date.now() + this.requestExpiry;

    // Create session to track candidates
    this.sessions.set(spaceId, {
      spaceId,
      channelId,
      expiry,
      candidates: [],
      inProgress: false,
    });

    return {
      type: 'sync-request',
      inboxAddress,
      expiry,
      summary: this.getSummary(cache),
    };
  }

  /**
   * Schedule sync initiation after timeout
   */
  scheduleSyncInitiation(
    spaceId: string,
    callback: () => void,
    timeoutMs: number = this.requestExpiry
  ): void {
    const session = this.sessions.get(spaceId);
    if (!session) return;

    // Clear existing timeout
    if (session.timeout) {
      clearTimeout(session.timeout);
    }

    session.timeout = setTimeout(() => {
      callback();
    }, timeoutMs);
  }

  // ============ Step 2: Sync Info ============

  /**
   * Build sync-info response if we have useful data.
   * Returns null if we have nothing to offer or are already in sync.
   */
  async buildSyncInfo(
    spaceId: string,
    channelId: string,
    inboxAddress: string,
    theirSummary: SyncSummary
  ): Promise<SyncInfoPayload | null> {
    logger.log(`[SyncService] buildSyncInfo called for space=${spaceId.substring(0, 12)}, channel=${channelId.substring(0, 12)}`);
    const cache = await this.getPayloadCache(spaceId, channelId);
    const ourSummary = this.getSummary(cache);

    logger.log(`[SyncService] buildSyncInfo: our data - ${cache.messageMap.size} messages, ${cache.memberMap.size} members`);
    logger.log(`[SyncService] buildSyncInfo: their summary:`, theirSummary);

    // Nothing to offer
    if (cache.messageMap.size === 0 && cache.memberMap.size === 0) {
      logger.log(`[SyncService] buildSyncInfo: returning null - we have no data`);
      return null;
    }

    logger.log(`[SyncService] buildSyncInfo: our summary:`, ourSummary);

    // Quick check: if manifest hashes match and member counts match, likely in sync
    if (
      ourSummary.manifestHash === theirSummary.manifestHash &&
      ourSummary.memberCount === theirSummary.memberCount
    ) {
      logger.log(`[SyncService] buildSyncInfo: returning null - hashes and member counts match`);
      return null;
    }

    // Check if we have anything they don't
    const hasMoreMessages = ourSummary.messageCount > theirSummary.messageCount;
    const hasMoreMembers = ourSummary.memberCount > theirSummary.memberCount;
    const hasNewerMessages = ourSummary.newestMessageTimestamp > theirSummary.newestMessageTimestamp;
    const hasOlderMessages = ourSummary.oldestMessageTimestamp < theirSummary.oldestMessageTimestamp;
    // If hashes differ, we likely have different messages even if counts are equal
    const hasDifferentMessages = ourSummary.manifestHash !== theirSummary.manifestHash;

    logger.log(`[SyncService] buildSyncInfo: comparison - hasMoreMessages=${hasMoreMessages}, hasMoreMembers=${hasMoreMembers}, hasNewerMessages=${hasNewerMessages}, hasOlderMessages=${hasOlderMessages}, hasDifferentMessages=${hasDifferentMessages}`);

    if (!hasMoreMessages && !hasMoreMembers && !hasNewerMessages && !hasOlderMessages && !hasDifferentMessages) {
      // They have same or more data and same messages
      logger.log(`[SyncService] buildSyncInfo: returning null - they have same or more data`);
      return null;
    }

    logger.log(`[SyncService] buildSyncInfo: returning sync-info response - we have data they don't`);
    return {
      type: 'sync-info',
      inboxAddress,
      summary: ourSummary,
    };
  }

  /**
   * Add candidate from sync-info response
   */
  addCandidate(spaceId: string, candidate: SyncCandidate): void {
    logger.log(`[SyncService] addCandidate called for space ${spaceId.substring(0, 12)}, candidate inbox: ${candidate.inboxAddress?.substring(0, 12)}`);
    const session = this.sessions.get(spaceId);
    if (!session) {
      logger.log(`[SyncService] addCandidate: No session found for space`);
      return;
    }
    if (Date.now() > session.expiry) {
      logger.log(`[SyncService] addCandidate: Session expired`);
      return;
    }

    session.candidates.push(candidate);
    logger.log(`[SyncService] addCandidate: Now have ${session.candidates.length} candidates`);

    // Use aggressive timeout after first candidate
    if (session.candidates.length === 1 && this.onInitiateSync) {
      logger.log(`[SyncService] addCandidate: Scheduling sync initiation in ${AGGRESSIVE_SYNC_TIMEOUT_MS}ms`);
      this.scheduleSyncInitiation(
        spaceId,
        () => {
          const best = this.selectBestCandidate(spaceId);
          logger.log(`[SyncService] addCandidate: Timeout triggered, best candidate: ${best?.inboxAddress?.substring(0, 12) || 'none'}`);
          if (best?.inboxAddress) {
            this.onInitiateSync!(spaceId, best.inboxAddress);
          } else {
            logger.log(`[SyncService] addCandidate: No valid candidate to sync with`);
          }
        },
        AGGRESSIVE_SYNC_TIMEOUT_MS
      );
    }
  }

  /**
   * Select best candidate based on data availability
   */
  selectBestCandidate(spaceId: string): SyncCandidate | null {
    const session = this.sessions.get(spaceId);
    if (!session || session.candidates.length === 0) return null;

    // Sort by message count (descending), then member count
    const sorted = [...session.candidates].sort((a, b) => {
      const msgDiff = b.summary.messageCount - a.summary.messageCount;
      if (msgDiff !== 0) return msgDiff;
      return b.summary.memberCount - a.summary.memberCount;
    });

    return sorted[0];
  }

  // ============ Step 3: Sync Initiate ============

  /**
   * Build sync-initiate payload for selected peer
   */
  async buildSyncInitiate(
    spaceId: string,
    channelId: string,
    inboxAddress: string,
    peerIds: number[]
  ): Promise<{ target: string; payload: SyncInitiatePayload } | null> {
    const candidate = this.selectBestCandidate(spaceId);
    if (!candidate) {
      this.sessions.delete(spaceId);
      return null;
    }

    const cache = await this.getPayloadCache(spaceId, channelId);

    // Mark sync in progress and store target
    this.setSyncInProgress(spaceId, true);
    this.setSyncTarget(spaceId, candidate.inboxAddress);

    return {
      target: candidate.inboxAddress,
      payload: {
        type: 'sync-initiate',
        inboxAddress,
        manifest: this.getManifest(cache),
        memberDigests: this.getMemberDigests(cache),
        peerIds,
      },
    };
  }

  // ============ Step 4: Sync Manifest ============

  /**
   * Build sync-manifest response to sync-initiate
   */
  async buildSyncManifest(
    spaceId: string,
    channelId: string,
    peerIds: number[],
    inboxAddress: string
  ): Promise<SyncManifestPayload> {
    const cache = await this.getPayloadCache(spaceId, channelId);

    return {
      type: 'sync-manifest',
      inboxAddress,
      manifest: this.getManifest(cache),
      memberDigests: this.getMemberDigests(cache),
      peerIds,
    };
  }

  // ============ Step 5: Sync Delta ============

  /**
   * Build sync-delta payloads based on manifest comparison.
   * May return multiple payloads for chunking.
   */
  async buildSyncDelta(
    spaceId: string,
    channelId: string,
    theirManifest: SyncManifest,
    theirMemberDigests: MemberDigest[],
    theirPeerIds: number[],
    ourPeerEntries: Map<number, PeerEntry>
  ): Promise<SyncDeltaPayload[]> {
    const cache = await this.getPayloadCache(spaceId, channelId);
    const ourPeerIds = [...ourPeerEntries.keys()];

    // Compute diffs using cached manifest and digests
    const ourManifest = this.getManifest(cache);
    const ourMemberDigests = this.getMemberDigests(cache);
    const messageDiff = computeMessageDiff(ourManifest, theirManifest);
    const memberDiff = computeMemberDiff(theirMemberDigests, ourMemberDigests);
    const peerDiff = computePeerDiff(theirPeerIds, ourPeerIds);

    // Build deltas using cached maps
    const messageDelta = buildMessageDelta(
      spaceId,
      channelId,
      messageDiff,
      cache.messageMap,
      this.tombstones
    );

    // Build reaction delta for messages they're missing or have outdated
    const reactionMessageIds = [...messageDiff.extraIds, ...messageDiff.outdatedIds];
    const reactionDelta = buildReactionDelta(spaceId, channelId, cache.messageMap, reactionMessageIds);

    const memberDelta = buildMemberDelta(spaceId, memberDiff, cache.memberMap);

    // Build peer map delta
    const peerMapDelta: PeerMapDelta = {
      spaceId,
      added: peerDiff.extraPeerIds
        .map((id) => ourPeerEntries.get(id))
        .filter((e): e is PeerEntry => e !== undefined),
      updated: [],
      removed: [],
    };

    // Create payloads with chunking
    const payloads: SyncDeltaPayload[] = [];
    const allMessages = [...messageDelta.newMessages, ...messageDelta.updatedMessages];

    if (allMessages.length > 0) {
      const chunks = chunkMessages(allMessages);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isLast = i === chunks.length - 1;

        const chunkDelta: MessageDelta = {
          spaceId,
          channelId,
          newMessages: chunk.filter((m) =>
            messageDiff.extraIds.includes(m.messageId)
          ),
          updatedMessages: chunk.filter((m) =>
            messageDiff.outdatedIds.includes(m.messageId)
          ),
          deletedMessageIds: isLast ? messageDelta.deletedMessageIds : [],
        };

        payloads.push({
          type: 'sync-delta',
          messageDelta: chunkDelta,
          // Include reaction delta only in last chunk
          reactionDelta: isLast && reactionDelta.added.length > 0 ? reactionDelta : undefined,
          isFinal: false,
        });
      }
    }

    // Add member and peer deltas
    if (
      memberDelta.members.length > 0 ||
      peerMapDelta.added.length > 0 ||
      allMessages.length === 0
    ) {
      payloads.push({
        type: 'sync-delta',
        memberDelta: memberDelta.members.length > 0 ? memberDelta : undefined,
        peerMapDelta: peerMapDelta.added.length > 0 ? peerMapDelta : undefined,
        isFinal: true,
      });
    } else if (payloads.length > 0) {
      // Mark last message chunk as final
      payloads[payloads.length - 1].isFinal = true;
    }

    // If no payloads, send empty final
    if (payloads.length === 0) {
      payloads.push({
        type: 'sync-delta',
        isFinal: true,
      });
    }

    return payloads;
  }

  // ============ Delta Application ============

  /**
   * Apply received message delta to local storage
   */
  async applyMessageDelta(delta: MessageDelta): Promise<void> {
    for (const msg of delta.newMessages) {
      await this.storage.saveMessage(msg, msg.createdDate, '', '', '', '');
    }

    for (const msg of delta.updatedMessages) {
      await this.storage.saveMessage(msg, msg.createdDate, '', '', '', '');
    }

    for (const id of delta.deletedMessageIds) {
      await this.storage.deleteMessage(id);
    }
  }

  /**
   * Apply received reaction delta to local storage.
   * This updates the reactions on existing messages.
   */
  async applyReactionDelta(delta: ReactionDelta): Promise<void> {
    for (const addition of delta.added) {
      const message = await this.storage.getMessage({
        spaceId: delta.spaceId,
        channelId: delta.channelId,
        messageId: addition.messageId,
      });

      if (message) {
        const reactions = message.reactions || [];
        const existing = reactions.find((r) => r.emojiId === addition.emojiId);

        if (existing) {
          // Merge member IDs
          const allMembers = new Set([...existing.memberIds, ...addition.memberIds]);
          existing.memberIds = [...allMembers];
          existing.count = existing.memberIds.length;
        } else {
          // Add new reaction
          reactions.push({
            emojiId: addition.emojiId,
            emojiName: addition.emojiId,
            spaceId: delta.spaceId,
            count: addition.memberIds.length,
            memberIds: addition.memberIds,
          });
        }

        message.reactions = reactions;
        await this.storage.saveMessage(message, message.createdDate, '', '', '', '');
      }
    }

    for (const removal of delta.removed) {
      const message = await this.storage.getMessage({
        spaceId: delta.spaceId,
        channelId: delta.channelId,
        messageId: removal.messageId,
      });

      if (message) {
        const reactions = message.reactions || [];
        const existing = reactions.find((r) => r.emojiId === removal.emojiId);

        if (existing) {
          // Remove member IDs
          existing.memberIds = existing.memberIds.filter(
            (id) => !removal.memberIds.includes(id)
          );
          existing.count = existing.memberIds.length;

          // Remove reaction if no members left
          if (existing.memberIds.length === 0) {
            message.reactions = reactions.filter((r) => r.emojiId !== removal.emojiId);
          }
        }

        await this.storage.saveMessage(message, message.createdDate, '', '', '', '');
      }
    }
  }

  /**
   * Apply received member delta to local storage
   */
  async applyMemberDelta(delta: MemberDelta): Promise<void> {
    for (const member of delta.members) {
      await this.storage.saveSpaceMember(delta.spaceId, member);
    }

    // Note: removed members would need storage support for deletion
  }

  /**
   * Apply full sync delta
   */
  async applySyncDelta(delta: SyncDeltaPayload): Promise<void> {
    if (delta.messageDelta) {
      await this.applyMessageDelta(delta.messageDelta);
    }

    if (delta.reactionDelta) {
      await this.applyReactionDelta(delta.reactionDelta);
    }

    if (delta.memberDelta) {
      await this.applyMemberDelta(delta.memberDelta);
    }

    // Peer map delta is handled by encryption layer (caller responsibility)

    // Clean up session if this is final
    if (delta.isFinal) {
      const spaceId = delta.messageDelta?.spaceId || delta.memberDelta?.spaceId;
      if (spaceId) {
        this.sessions.delete(spaceId);
      }
    }
  }

  // ============ Tombstone Management ============

  /**
   * Record a deleted message tombstone
   */
  addTombstone(tombstone: DeletedMessageTombstone): void {
    this.tombstones.push(tombstone);
  }

  /**
   * Get all tombstones (for persistence by caller)
   */
  getTombstones(): DeletedMessageTombstone[] {
    return [...this.tombstones];
  }

  /**
   * Load tombstones (from caller's persistence)
   */
  loadTombstones(tombstones: DeletedMessageTombstone[]): void {
    this.tombstones = [...tombstones];
  }

  /**
   * Clean up old tombstones (older than 30 days)
   */
  cleanupTombstones(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    this.tombstones = this.tombstones.filter((t) => t.deletedAt > cutoff);
  }

  // ============ Helpers ============

  private async getChannelMessages(spaceId: string, channelId: string): Promise<Message[]> {
    const result = await this.storage.getMessages({
      spaceId,
      channelId,
      limit: this.maxMessages,
    });
    return result.messages;
  }

  /**
   * Clean up expired sessions
   */
  cleanupSessions(): void {
    const now = Date.now();
    for (const [spaceId, session] of this.sessions) {
      if (now > session.expiry) {
        if (session.timeout) {
          clearTimeout(session.timeout);
        }
        this.sessions.delete(spaceId);
      }
    }
  }

  /**
   * Cancel active sync for a space
   */
  cancelSync(spaceId: string): void {
    const session = this.sessions.get(spaceId);
    if (session?.timeout) {
      clearTimeout(session.timeout);
    }
    this.sessions.delete(spaceId);
  }
}
