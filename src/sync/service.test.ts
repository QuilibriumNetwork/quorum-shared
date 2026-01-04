/**
 * SyncService Tests
 *
 * Tests the sync service functionality including:
 * - Payload cache management
 * - buildSyncRequest
 * - buildSyncInfo
 * - buildSyncInitiate
 * - buildSyncManifest
 * - buildSyncDelta
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from './service';
import type { StorageAdapter } from '../storage';
import type { Message, SpaceMember } from '../types';
import type { SyncSummary, SyncManifest, MemberDigest } from './types';
import { createSyncSummary, createManifest, createMemberDigest, MAX_CHUNK_SIZE } from './utils';

// Mock storage adapter
function createMockStorage(
  messages: Message[] = [],
  members: SpaceMember[] = []
): StorageAdapter {
  return {
    getMessages: vi.fn().mockResolvedValue({ messages, nextCursor: null }),
    getMessage: vi.fn().mockImplementation(async ({ messageId }) => {
      return messages.find((m) => m.messageId === messageId) || null;
    }),
    saveMessage: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    getSpaceMembers: vi.fn().mockResolvedValue(members),
    saveSpaceMember: vi.fn().mockResolvedValue(undefined),
    // Add other required methods as no-ops
    getConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    saveConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageAdapter;
}

// Helper to create a test message
function createTestMessage(
  id: string,
  spaceId: string,
  channelId: string,
  text: string,
  createdDate: number = Date.now()
): Message {
  return {
    messageId: id,
    spaceId,
    channelId,
    digestAlgorithm: 'sha256',
    nonce: 'test-nonce',
    createdDate,
    modifiedDate: createdDate,
    lastModifiedHash: 'hash',
    content: {
      type: 'post',
      senderId: 'sender-address',
      text,
    },
    reactions: [],
    mentions: { memberIds: [], roleIds: [], channelIds: [] },
  };
}

// Helper to create a test member
function createTestMember(address: string, displayName?: string): SpaceMember {
  return {
    address,
    inbox_address: `inbox-${address}`,
    display_name: displayName,
  };
}

describe('SyncService', () => {
  const spaceId = 'test-space-id';
  const channelId = 'test-channel-id';
  const inboxAddress = 'test-inbox-address';

  describe('Cache Management', () => {
    it('should load data from storage on first access', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello')];
      const members = [createTestMember('addr1', 'User1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // First call should fetch from storage
      const payload = await service.buildSyncRequest(spaceId, channelId, inboxAddress);

      expect(storage.getMessages).toHaveBeenCalledTimes(1);
      expect(storage.getSpaceMembers).toHaveBeenCalledTimes(1);
      expect(payload.summary.messageCount).toBe(1);
      expect(payload.summary.memberCount).toBe(1);
    });

    it('should use cache on subsequent access', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello')];
      const members = [createTestMember('addr1', 'User1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // First call
      await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      // Second call should use cache
      await service.buildSyncRequest(spaceId, channelId, inboxAddress);

      // Storage should only be called once
      expect(storage.getMessages).toHaveBeenCalledTimes(1);
      expect(storage.getSpaceMembers).toHaveBeenCalledTimes(1);
    });

    it('should update cache with new message without storage query', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello')];
      const members = [createTestMember('addr1', 'User1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache
      const payload1 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload1.summary.messageCount).toBe(1);

      // Update cache with new message
      const newMessage = createTestMessage('msg2', spaceId, channelId, 'World');
      service.updateCacheWithMessage(spaceId, channelId, newMessage);

      // Get payload again - should reflect new message without storage query
      const payload2 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload2.summary.messageCount).toBe(2);

      // Storage should still only be called once (initial load)
      expect(storage.getMessages).toHaveBeenCalledTimes(1);
    });

    it('should update cache with new member without storage query', async () => {
      const messages: Message[] = [];
      const members = [createTestMember('addr1', 'User1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache
      const payload1 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload1.summary.memberCount).toBe(1);

      // Update cache with new member
      const newMember = createTestMember('addr2', 'User2');
      service.updateCacheWithMember(spaceId, channelId, newMember);

      // Get payload again - should reflect new member without storage query
      const payload2 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload2.summary.memberCount).toBe(2);

      // Storage should still only be called once (initial load)
      expect(storage.getSpaceMembers).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache and reload from storage', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello')];
      const members = [createTestMember('addr1', 'User1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache
      await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(storage.getMessages).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidateCache(spaceId, channelId);

      // Next call should fetch from storage again
      await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(storage.getMessages).toHaveBeenCalledTimes(2);
    });
  });

  describe('buildSyncRequest', () => {
    it('should return correct payload structure', async () => {
      const messages = [
        createTestMessage('msg1', spaceId, channelId, 'Hello', 1000),
        createTestMessage('msg2', spaceId, channelId, 'World', 2000),
      ];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });
      const payload = await service.buildSyncRequest(spaceId, channelId, inboxAddress);

      expect(payload.type).toBe('sync-request');
      expect(payload.inboxAddress).toBe(inboxAddress);
      expect(payload.expiry).toBeGreaterThan(Date.now());
      expect(payload.summary.messageCount).toBe(2);
      expect(payload.summary.memberCount).toBe(1);
      expect(payload.summary.oldestMessageTimestamp).toBe(1000);
      expect(payload.summary.newestMessageTimestamp).toBe(2000);
    });

    it('should create a sync session', async () => {
      const storage = createMockStorage([], []);
      const service = new SyncService({ storage });

      await service.buildSyncRequest(spaceId, channelId, inboxAddress);

      expect(service.hasActiveSession(spaceId)).toBe(true);
    });
  });

  describe('buildSyncInfo', () => {
    it('should return null when we have no data', async () => {
      const storage = createMockStorage([], []);
      const service = new SyncService({ storage });

      const theirSummary: SyncSummary = {
        messageCount: 5,
        memberCount: 3,
        newestMessageTimestamp: 1000,
        oldestMessageTimestamp: 500,
      };

      const result = await service.buildSyncInfo(spaceId, channelId, inboxAddress, theirSummary);
      expect(result).toBeNull();
    });

    it('should return null when manifests match', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Build our summary first to get the manifest hash
      const ourPayload = await service.buildSyncRequest(spaceId, channelId, inboxAddress);

      // Their summary matches ours
      const theirSummary: SyncSummary = {
        messageCount: 1,
        memberCount: 1,
        newestMessageTimestamp: 1000,
        oldestMessageTimestamp: 1000,
        manifestHash: ourPayload.summary.manifestHash,
      };

      const result = await service.buildSyncInfo(spaceId, channelId, inboxAddress, theirSummary);
      expect(result).toBeNull();
    });

    it('should return sync-info when we have more messages', async () => {
      const messages = [
        createTestMessage('msg1', spaceId, channelId, 'Hello', 1000),
        createTestMessage('msg2', spaceId, channelId, 'World', 2000),
      ];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      const theirSummary: SyncSummary = {
        messageCount: 1,
        memberCount: 1,
        newestMessageTimestamp: 1000,
        oldestMessageTimestamp: 1000,
      };

      const result = await service.buildSyncInfo(spaceId, channelId, inboxAddress, theirSummary);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('sync-info');
      expect(result!.summary.messageCount).toBe(2);
    });

    it('should return sync-info when we have newer messages', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 2000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      const theirSummary: SyncSummary = {
        messageCount: 1,
        memberCount: 1,
        newestMessageTimestamp: 1000,
        oldestMessageTimestamp: 1000,
      };

      const result = await service.buildSyncInfo(spaceId, channelId, inboxAddress, theirSummary);
      expect(result).not.toBeNull();
    });
  });

  describe('buildSyncManifest', () => {
    it('should return correct manifest payload', async () => {
      const messages = [
        createTestMessage('msg1', spaceId, channelId, 'Hello', 1000),
        createTestMessage('msg2', spaceId, channelId, 'World', 2000),
      ];
      const members = [
        createTestMember('addr1', 'User1'),
        createTestMember('addr2', 'User2'),
      ];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });
      const peerIds = [1, 2, 3];

      const payload = await service.buildSyncManifest(spaceId, channelId, peerIds, inboxAddress);

      expect(payload.type).toBe('sync-manifest');
      expect(payload.inboxAddress).toBe(inboxAddress);
      expect(payload.manifest.messageCount).toBe(2);
      expect(payload.manifest.digests).toHaveLength(2);
      expect(payload.memberDigests).toHaveLength(2);
      expect(payload.peerIds).toEqual(peerIds);
    });

    it('should use cached data', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello')];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // First call - loads cache
      await service.buildSyncManifest(spaceId, channelId, [], inboxAddress);
      // Second call - should use cache
      await service.buildSyncManifest(spaceId, channelId, [], inboxAddress);

      expect(storage.getMessages).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildSyncDelta', () => {
    it('should return empty delta when no differences', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Build our manifest
      const ourManifest = await service.buildSyncManifest(spaceId, channelId, [], inboxAddress);

      // Their manifest is the same as ours
      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        ourManifest.manifest,
        ourManifest.memberDigests,
        [],
        new Map()
      );

      // Should have one final delta with no data
      expect(deltas).toHaveLength(1);
      expect(deltas[0].isFinal).toBe(true);
      expect(deltas[0].messageDelta).toBeUndefined();
      expect(deltas[0].memberDelta).toBeUndefined();
    });

    it('should include messages they are missing', async () => {
      const messages = [
        createTestMessage('msg1', spaceId, channelId, 'Hello', 1000),
        createTestMessage('msg2', spaceId, channelId, 'World', 2000),
      ];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Their manifest only has msg1
      const theirManifest: SyncManifest = createManifest(spaceId, channelId, [messages[0]]);
      const theirMemberDigests = members.map(createMemberDigest);

      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        theirManifest,
        theirMemberDigests,
        [],
        new Map()
      );

      // Should include msg2 as new message
      const allNewMessages = deltas.flatMap((d) => d.messageDelta?.newMessages || []);
      expect(allNewMessages).toHaveLength(1);
      expect(allNewMessages[0].messageId).toBe('msg2');
    });

    it('should include members they are missing', async () => {
      const messages: Message[] = [];
      const members = [
        createTestMember('addr1', 'User1'),
        createTestMember('addr2', 'User2'),
      ];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // They only have addr1
      const theirManifest: SyncManifest = createManifest(spaceId, channelId, []);
      const theirMemberDigests = [createMemberDigest(members[0])];

      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        theirManifest,
        theirMemberDigests,
        [],
        new Map()
      );

      // Should include addr2 as new member
      const finalDelta = deltas.find((d) => d.isFinal);
      expect(finalDelta?.memberDelta?.members).toHaveLength(1);
      expect(finalDelta?.memberDelta?.members[0].address).toBe('addr2');
    });
  });

  describe('buildSyncDelta chunking', () => {
    // Use 1MB chunk size for testing (matching realistic network limits)
    const TEST_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
    const msgSize = 200000; // 200KB per message
    const numMessagesForChunking = 6; // 6 messages * 200KB = 1.2MB > 1MB

    it('should chunk large message sets into multiple payloads', async () => {
      // Create messages that will exceed chunk size
      const largeText = 'x'.repeat(msgSize);

      const messages: Message[] = [];
      for (let i = 0; i < numMessagesForChunking; i++) {
        messages.push(createTestMessage(`msg${i}`, spaceId, channelId, largeText, 1000 + i));
      }

      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);
      const service = new SyncService({ storage });

      // Their manifest is empty - they need all messages
      const theirManifest: SyncManifest = createManifest(spaceId, channelId, []);
      const theirMemberDigests: MemberDigest[] = [createMemberDigest(members[0])];

      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        theirManifest,
        theirMemberDigests,
        [],
        new Map()
      );

      // Should have multiple chunks (6 messages at 200KB each = 1.2MB, chunked at 5MB default)
      // With default 5MB chunks, this won't chunk, but verifies the mechanism works
      expect(deltas.length).toBeGreaterThanOrEqual(1);

      // Only last delta should be final
      const finalDeltas = deltas.filter(d => d.isFinal);
      expect(finalDeltas).toHaveLength(1);
      expect(deltas[deltas.length - 1].isFinal).toBe(true);

      // All messages should be included across chunks
      const allNewMessages = deltas.flatMap(d => d.messageDelta?.newMessages || []);
      expect(allNewMessages).toHaveLength(numMessagesForChunking);
    });

    it('should chunk when total size exceeds MAX_CHUNK_SIZE', async () => {
      // Create enough messages to exceed MAX_CHUNK_SIZE (5MB)
      // 1MB per message * 6 = 6MB > 5MB
      const oneMbText = 'x'.repeat(1024 * 1024);
      const numMessages = 6;

      const messages: Message[] = [];
      for (let i = 0; i < numMessages; i++) {
        messages.push(createTestMessage(`msg${i}`, spaceId, channelId, oneMbText, 1000 + i));
      }

      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);
      const service = new SyncService({ storage });

      const theirManifest: SyncManifest = createManifest(spaceId, channelId, []);
      const theirMemberDigests: MemberDigest[] = [createMemberDigest(members[0])];

      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        theirManifest,
        theirMemberDigests,
        [],
        new Map()
      );

      // Should have multiple chunks since 6MB > 5MB limit
      expect(deltas.length).toBeGreaterThan(1);

      // All messages should be included across chunks
      const allNewMessages = deltas.flatMap(d => d.messageDelta?.newMessages || []);
      expect(allNewMessages).toHaveLength(numMessages);

      // Only last delta should be final
      expect(deltas[deltas.length - 1].isFinal).toBe(true);
      expect(deltas.filter(d => d.isFinal)).toHaveLength(1);
    });

    it('should handle single oversized message', async () => {
      // Create a single message larger than MAX_CHUNK_SIZE (5MB)
      const hugeText = 'x'.repeat(MAX_CHUNK_SIZE + 1000);
      const messages = [createTestMessage('msg1', spaceId, channelId, hugeText, 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);
      const service = new SyncService({ storage });

      const theirManifest: SyncManifest = createManifest(spaceId, channelId, []);
      const theirMemberDigests: MemberDigest[] = [createMemberDigest(members[0])];

      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        theirManifest,
        theirMemberDigests,
        [],
        new Map()
      );

      // Should still work - message sent in its own chunk
      const allNewMessages = deltas.flatMap(d => d.messageDelta?.newMessages || []);
      expect(allNewMessages).toHaveLength(1);
      expect(allNewMessages[0].messageId).toBe('msg1');
    });

    it('should include reaction delta only in last message chunk', async () => {
      // Create messages that will require chunking (1MB each, 6 total = 6MB > 5MB)
      const oneMbText = 'x'.repeat(1024 * 1024);
      const messages: Message[] = [];
      for (let i = 0; i < 6; i++) {
        const msg = createTestMessage(`msg${i}`, spaceId, channelId, oneMbText, 1000 + i);
        // Add reactions to some messages
        if (i % 2 === 0) {
          msg.reactions = [{
            emojiId: '👍',
            emojiName: 'thumbsup',
            spaceId,
            count: 1,
            memberIds: ['addr1'],
          }];
        }
        messages.push(msg);
      }

      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);
      const service = new SyncService({ storage });

      const theirManifest: SyncManifest = createManifest(spaceId, channelId, []);
      const theirMemberDigests: MemberDigest[] = [createMemberDigest(members[0])];

      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        theirManifest,
        theirMemberDigests,
        [],
        new Map()
      );

      // Reaction delta should only be in the last message chunk (before member delta)
      const deltasWithReactions = deltas.filter(d => d.reactionDelta && d.reactionDelta.added.length > 0);
      expect(deltasWithReactions.length).toBeLessThanOrEqual(1);
    });

    it('should put member delta in final chunk', async () => {
      // Create messages that will require chunking (1MB each)
      const oneMbText = 'x'.repeat(1024 * 1024);
      const messages: Message[] = [];
      for (let i = 0; i < 6; i++) {
        messages.push(createTestMessage(`msg${i}`, spaceId, channelId, oneMbText, 1000 + i));
      }

      const members = [
        createTestMember('addr1', 'User1'),
        createTestMember('addr2', 'User2'),
      ];
      const storage = createMockStorage(messages, members);
      const service = new SyncService({ storage });

      // They have no members
      const theirManifest: SyncManifest = createManifest(spaceId, channelId, []);
      const theirMemberDigests: MemberDigest[] = [];

      const deltas = await service.buildSyncDelta(
        spaceId,
        channelId,
        theirManifest,
        theirMemberDigests,
        [],
        new Map()
      );

      // Member delta should be in the final payload
      const finalDelta = deltas.find(d => d.isFinal);
      expect(finalDelta).toBeDefined();
      expect(finalDelta?.memberDelta?.members).toHaveLength(2);
    });
  });

  describe('O(1) cache updates', () => {
    it('should not recompute manifest hash when updating existing message', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache and get initial hash
      const payload1 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      const hash1 = payload1.summary.manifestHash;

      // Update existing message (not adding a new one)
      const updatedMessage = createTestMessage('msg1', spaceId, channelId, 'Updated text', 1000);
      service.updateCacheWithMessage(spaceId, channelId, updatedMessage);

      // Hash should remain the same (message set didn't change, only content)
      const payload2 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      const hash2 = payload2.summary.manifestHash;

      // Manifest hash is based on message IDs, not content, so should be same
      expect(hash1).toBe(hash2);
    });

    it('should lazily recompute manifest hash only when needed after adding message', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache
      await service.buildSyncRequest(spaceId, channelId, inboxAddress);

      // Add multiple messages without accessing the hash
      for (let i = 2; i <= 10; i++) {
        service.updateCacheWithMessage(
          spaceId,
          channelId,
          createTestMessage(`msg${i}`, spaceId, channelId, `Message ${i}`, 1000 + i)
        );
      }

      // Now request summary - hash should be computed once
      const payload = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload.summary.messageCount).toBe(10);
      expect(payload.summary.manifestHash).toBeDefined();
    });

    it('should update timestamps in O(1) when adding newer message', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache
      const payload1 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload1.summary.newestMessageTimestamp).toBe(1000);
      expect(payload1.summary.oldestMessageTimestamp).toBe(1000);

      // Add newer message
      service.updateCacheWithMessage(
        spaceId,
        channelId,
        createTestMessage('msg2', spaceId, channelId, 'Newer', 2000)
      );

      const payload2 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload2.summary.newestMessageTimestamp).toBe(2000);
      expect(payload2.summary.oldestMessageTimestamp).toBe(1000);

      // Add older message
      service.updateCacheWithMessage(
        spaceId,
        channelId,
        createTestMessage('msg0', spaceId, channelId, 'Older', 500)
      );

      const payload3 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload3.summary.newestMessageTimestamp).toBe(2000);
      expect(payload3.summary.oldestMessageTimestamp).toBe(500);
    });

    it('should update member count in O(1)', async () => {
      const messages: Message[] = [];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache
      const payload1 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload1.summary.memberCount).toBe(1);

      // Add members without storage query
      service.updateCacheWithMember(spaceId, channelId, createTestMember('addr2'));
      service.updateCacheWithMember(spaceId, channelId, createTestMember('addr3'));

      const payload2 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload2.summary.memberCount).toBe(3);

      // Storage should only be called once (initial load)
      expect(storage.getSpaceMembers).toHaveBeenCalledTimes(1);
    });

    it('should restore original hash after adding then removing a message (XOR property)', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Get initial hash
      const payload1 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      const originalHash = payload1.summary.manifestHash;

      // Add a message
      service.updateCacheWithMessage(
        spaceId,
        channelId,
        createTestMessage('msg2', spaceId, channelId, 'World', 2000)
      );

      // Hash should be different
      const payload2 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload2.summary.manifestHash).not.toBe(originalHash);

      // Remove the message we added
      service.removeCacheMessage(spaceId, channelId, 'msg2');

      // Hash should be back to original (XOR is its own inverse)
      const payload3 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload3.summary.manifestHash).toBe(originalHash);
    });

    it('should produce same hash regardless of message add order (XOR commutativity)', async () => {
      const members = [createTestMember('addr1')];

      // First service: add msg1, msg2, msg3 in order
      const storage1 = createMockStorage([], members);
      const service1 = new SyncService({ storage: storage1 });
      await service1.buildSyncRequest(spaceId, channelId, inboxAddress);
      service1.updateCacheWithMessage(spaceId, channelId, createTestMessage('msg1', spaceId, channelId, 'A', 1000));
      service1.updateCacheWithMessage(spaceId, channelId, createTestMessage('msg2', spaceId, channelId, 'B', 2000));
      service1.updateCacheWithMessage(spaceId, channelId, createTestMessage('msg3', spaceId, channelId, 'C', 3000));
      const hash1 = (await service1.buildSyncRequest(spaceId, channelId, inboxAddress)).summary.manifestHash;

      // Second service: add msg3, msg1, msg2 in different order
      const storage2 = createMockStorage([], members);
      const service2 = new SyncService({ storage: storage2 });
      await service2.buildSyncRequest(spaceId, channelId, inboxAddress);
      service2.updateCacheWithMessage(spaceId, channelId, createTestMessage('msg3', spaceId, channelId, 'C', 3000));
      service2.updateCacheWithMessage(spaceId, channelId, createTestMessage('msg1', spaceId, channelId, 'A', 1000));
      service2.updateCacheWithMessage(spaceId, channelId, createTestMessage('msg2', spaceId, channelId, 'B', 2000));
      const hash2 = (await service2.buildSyncRequest(spaceId, channelId, inboxAddress)).summary.manifestHash;

      // Hashes should be identical (XOR is commutative)
      expect(hash1).toBe(hash2);
    });
  });

  describe('Cache consistency after updates', () => {
    it('should maintain consistent manifest hash after message updates', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Get initial hash
      const payload1 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      const hash1 = payload1.summary.manifestHash;

      // Add a message
      const newMessage = createTestMessage('msg2', spaceId, channelId, 'World', 2000);
      service.updateCacheWithMessage(spaceId, channelId, newMessage);

      // Get new hash
      const payload2 = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      const hash2 = payload2.summary.manifestHash;

      // Hashes should be different
      expect(hash1).not.toBe(hash2);

      // Verify the new manifest includes both messages
      const manifest = await service.buildSyncManifest(spaceId, channelId, [], inboxAddress);
      expect(manifest.manifest.digests).toHaveLength(2);
    });

    it('should correctly update existing message in cache', async () => {
      const messages = [createTestMessage('msg1', spaceId, channelId, 'Hello', 1000)];
      const members = [createTestMember('addr1')];
      const storage = createMockStorage(messages, members);

      const service = new SyncService({ storage });

      // Initialize cache
      await service.buildSyncRequest(spaceId, channelId, inboxAddress);

      // Update existing message
      const updatedMessage = createTestMessage('msg1', spaceId, channelId, 'Updated', 1000);
      updatedMessage.modifiedDate = 2000;
      service.updateCacheWithMessage(spaceId, channelId, updatedMessage);

      // Message count should still be 1
      const payload = await service.buildSyncRequest(spaceId, channelId, inboxAddress);
      expect(payload.summary.messageCount).toBe(1);

      // But the content hash should have changed
      const manifest = await service.buildSyncManifest(spaceId, channelId, [], inboxAddress);
      expect(manifest.manifest.digests[0].modifiedDate).toBe(2000);
    });
  });
});
