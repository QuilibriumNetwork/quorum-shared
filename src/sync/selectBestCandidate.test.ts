// Which peer do we sync with?
//
// Several members answer a `sync-request`, each advertising what it holds
// (`messageCount` and `memberCount`). We pick ONE and get whatever that peer
// has — both its messages and its member roster.
//
// UNTIL 2026-08-02 the sort was message-count first, with member count as a
// tiebreaker:
//
//     const msgDiff = b.summary.messageCount - a.summary.messageCount;
//     if (msgDiff !== 0) return msgDiff;
//     return b.summary.memberCount - a.summary.memberCount;
//
// Message counts are essentially never exactly equal, so the tiebreaker never
// fired and roster completeness was effectively ignored. Measured live on
// 2026-08-02: a joining client was offered peers advertising **90**, **79** and
// **72** members in one window and synced with the **72** one, because that peer
// happened to hold the most messages. The arithmetic was exact — 72 − 1 (the
// joiner's own row, which that peer also held) = the 71 rows received. It ended
// 18 identities short of what was on the table, and every one of those is a
// person who renders as a truncated address.
//
// These tests pin both edges of the replacement:
//   too message-biased → the roster stays whatever the message-optimal peer
//                        happens to have, i.e. today's bug
//   too member-biased  → roster completeness starts beating message history and
//                        a joiner syncs from a peer with almost no messages
//
// ⚠️ Assert OUTCOMES, not weights. The weights are an implementation detail and
// are expected to be tuned; the ranking behaviour below is the contract.

import { describe, it, expect, vi } from 'vitest';
import { SyncService } from './service';
import type { StorageAdapter } from '../storage';
import type { SyncCandidate } from './types';

const spaceId = 'test-space-id';
const channelId = 'test-channel-id';
const ourInbox = 'our-inbox';

function createMockStorage(): StorageAdapter {
  return {
    getMessages: vi.fn().mockResolvedValue({ messages: [], nextCursor: null }),
    getMessage: vi.fn().mockResolvedValue(null),
    saveMessage: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    getSpaceMembers: vi.fn().mockResolvedValue([]),
    saveSpaceMember: vi.fn().mockResolvedValue(undefined),
    getConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    saveConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageAdapter;
}

/** A peer's `sync-info` answer, reduced to the two numbers selection reads. */
function peer(
  label: string,
  messageCount: number,
  memberCount: number
): SyncCandidate {
  return {
    inboxAddress: label,
    summary: {
      messageCount,
      memberCount,
      newestMessageTimestamp: 0,
      oldestMessageTimestamp: 0,
    },
  };
}

/**
 * A service with an open sync session and the given candidates registered.
 *
 * No `onInitiateSync` is supplied on purpose: `addCandidate` only arms its
 * timer when that callback exists, so leaving it out keeps these tests free of
 * fake timers.
 */
async function withCandidates(...candidates: SyncCandidate[]) {
  const service = new SyncService({ storage: createMockStorage() });
  await service.buildSyncRequest(spaceId, channelId, ourInbox);
  for (const candidate of candidates) service.addCandidate(spaceId, candidate);
  return service;
}

describe('selectBestCandidate', () => {
  // THE regression test — the 2026-08-02 join, with its real member counts.
  //
  // The message counts must DIFFER slightly for this to reproduce, and that is
  // the whole point: had they been exactly equal the old tiebreaker would have
  // fired and picked correctly. In a real space the counts are near-identical
  // but never equal, so the tiebreaker was dead code and a 2-message edge was
  // enough to cost 18 member identities.
  it('takes the fullest roster when the peers are near-level on messages', async () => {
    const service = await withCandidates(
      peer('ninety', 3, 90),
      peer('seventy-nine', 4, 79),
      peer('seventy-two', 5, 72)
    );

    expect(service.selectBestCandidate(spaceId)?.inboxAddress).toBe('ninety');
  });

  // Order of arrival must not decide it — the 72-member peer answered first in
  // the live capture.
  it('is unaffected by the order the peers answered in', async () => {
    const service = await withCandidates(
      peer('seventy-two', 5, 72),
      peer('ninety', 3, 90),
      peer('seventy-nine', 4, 79)
    );

    expect(service.selectBestCandidate(spaceId)?.inboxAddress).toBe('ninety');
  });

  it('prefers a much fuller roster when the message counts are close', async () => {
    const service = await withCandidates(
      peer('most-messages', 100, 10),
      peer('almost-as-many-messages-far-more-members', 90, 90)
    );

    expect(service.selectBestCandidate(spaceId)?.inboxAddress).toBe(
      'almost-as-many-messages-far-more-members'
    );
  });

  // The opposite edge: roster completeness must NOT start winning on its own.
  // A joiner that syncs from a near-empty peer to gain two member rows has
  // traded away the space's history.
  it('keeps the message-rich peer when the roster gain would be marginal', async () => {
    const service = await withCandidates(
      peer('rich-history', 100, 70),
      peer('two-more-members-almost-no-history', 20, 72)
    );

    expect(service.selectBestCandidate(spaceId)?.inboxAddress).toBe('rich-history');
  });

  it('never prefers a peer that advertises nothing at all', async () => {
    const service = await withCandidates(peer('empty', 0, 0), peer('has-something', 1, 1));

    expect(service.selectBestCandidate(spaceId)?.inboxAddress).toBe('has-something');
  });

  // Older peers may not put `memberCount` on the wire. Such a peer must not be
  // ranked as if it had the best roster, and must not poison the arithmetic for
  // everyone else (a NaN score compares false against everything and would make
  // the result depend on sort order).
  it('treats a missing member count as zero rather than as unknown-but-good', async () => {
    const noCount = peer('legacy-peer', 100, undefined as unknown as number);
    const service = await withCandidates(noCount, peer('modern-peer', 90, 80));

    expect(service.selectBestCandidate(spaceId)?.inboxAddress).toBe('modern-peer');
  });

  it('survives a peer whose counts are not finite', async () => {
    const service = await withCandidates(
      peer('broken', NaN, Infinity),
      peer('sane', 10, 10)
    );

    expect(service.selectBestCandidate(spaceId)?.inboxAddress).toBe('sane');
  });

  it('returns the same peer when asked twice, and leaves the candidates alone', async () => {
    const service = await withCandidates(peer('a', 5, 50), peer('b', 4, 40));

    const first = service.selectBestCandidate(spaceId)?.inboxAddress;
    const second = service.selectBestCandidate(spaceId)?.inboxAddress;

    expect(first).toBe(second);
    // Selection must not consume or reorder the session's candidate list: the
    // caller may re-select after a failed sync attempt.
    expect(service.selectBestCandidate(spaceId)).not.toBeNull();
  });

  it('returns null when nobody answered', async () => {
    const service = await withCandidates();

    expect(service.selectBestCandidate(spaceId)).toBeNull();
  });

  it('returns null when there is no session for the space', async () => {
    const service = new SyncService({ storage: createMockStorage() });

    expect(service.selectBestCandidate('a-space-we-never-asked-about')).toBeNull();
  });
});
