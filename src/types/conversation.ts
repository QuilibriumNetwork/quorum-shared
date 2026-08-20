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
   * ⚠️ SNAKE_CASE ON PURPOSE, breaking this type's own convention. quorum-mobile
   * has been reading and writing exactly this key for a long time (MEASURED
   * 2026-08-20: 23 files use `claimed_primary_username`, none use a camelCase
   * spelling), previously force-cast past its own type checker because the field
   * was undeclared here. Declaring the camelCase spelling instead would have
   * made this type describe a field that no mobile row ever carries — a clean
   * compile returning `undefined` forever, which is the worst kind of bug.
   * Desktop is the newcomer to this concept and conforms to mobile, not the
   * reverse.
   *
   * Empty string = a deliberate un-election, distinct from absent ("no change").
   */
  claimed_primary_username?: string;
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
