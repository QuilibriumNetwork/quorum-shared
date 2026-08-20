/**
 * Conversation (DM) types for Quorum
 */

export type ConversationSource = 'quorum' | 'farcaster';

export type Conversation = {
  conversationId: string;
  type: 'direct' | 'group';
  timestamp: number;
  address: string;
  icon: string;
  displayName: string;
  // DM partner's bio, received via DMUpdateProfileMessage. Mirrors the
  // space-side per-member bio. Empty string = explicitly cleared.
  bio?: string;
  /**
   * The `.q` primary username the DM partner CLAIMS, as received on a
   * `dm-update-profile` frame.
   *
   * ⚠️ UNVERIFIED. Nobody has checked that the partner's account owns this
   * name — the frame is simply what they said about themselves. Do not render
   * it, and do not append `.q` to it. Verification is a separate lookup
   * (desktop: `identity/useVerifiedQnsNames.ts`), and the whole point of the
   * separate field name is that a surface which skips verification cannot
   * accidentally read a claim out of the verified slot.
   *
   * Named to match mobile's `claimed_primary_username` in meaning; the casing
   * follows this type's own convention rather than mobile's storage key.
   *
   * Empty string = a deliberate un-election, distinct from absent ("no change").
   */
  claimedPrimaryUsername?: string;
  lastReadTimestamp?: number;
  isRepudiable?: boolean;
  saveEditHistory?: boolean;
  // Per-conversation receipt overrides (undefined = use global setting)
  deliveryReceipts?: boolean;
  readReceipts?: boolean;
  lastMessageId?: string;
  // Farcaster-specific fields
  source?: ConversationSource;  // 'quorum' (E2EE) or 'farcaster' (direct cast)
  farcasterConversationId?: string;  // Farcaster conversation ID (e.g., "123-456")
  farcasterFid?: number;  // Counterparty's Farcaster FID (for 1:1 DMs)
  farcasterUsername?: string;  // Counterparty's Farcaster username
  farcasterParticipantFids?: number[];  // All participant FIDs except current user (for group chats)
  unreadCount?: number;  // Farcaster unread count
};
