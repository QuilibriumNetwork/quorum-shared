/**
 * User-related types for Quorum
 */

import type { Bookmark } from './bookmark';
import type { BroadcastSpaceTag } from './space';

export type FolderColor = string;

export type NavItem =
  | { type: 'space'; id: string }
  | {
      type: 'folder';
      id: string;
      name: string;
      spaceIds: string[];
      icon?: string;
      color?: FolderColor;
      iconVariant?: 'outline' | 'filled';
      createdDate: number;
      modifiedDate: number;
    };

export type NotificationSettings = {
  enabled?: boolean;
  mentions?: boolean;
  replies?: boolean;
  all?: boolean;
  // When true, ALL notifications for this space are suppressed (space-level mute).
  // Takes precedence over per-channel mute. Desktop already writes this field;
  // declaring it here lets both apps read/write it typed and keeps space-mute in
  // sync across devices via the UserConfig blob.
  isMuted?: boolean;
};

export type UserNote = {
  targetAddress: string;
  note: string;
  updatedAt: number;
};

/**
 * Per-conversation DM setting overrides, synced across a user's devices via the
 * encrypted `UserConfig` blob. Each field is optional; an absent field means
 * "inherit the global setting / default" for that conversation.
 *
 * Merge is per-entry last-write-wins keyed by `updatedAt` (see
 * `mergeConversationSettings`). A reset-to-global writes an entry with no
 * override fields (just `updatedAt`), which acts as its own tombstone: a newer
 * empty entry beats an older non-empty one, so a reset propagates across devices
 * without a separate deletion-tracking array.
 */
export type ConversationSettingOverrides = {
  /** Keep previous versions of edited messages in this conversation. */
  saveEditHistory?: boolean;
  /** Always sign messages in this conversation (non-repudiable). */
  isRepudiable?: boolean;
  /** Delivery-receipt override for this conversation. */
  deliveryReceipts?: boolean;
  /** Read-receipt override for this conversation (requires delivery on). */
  readReceipts?: boolean;
  /** ms epoch of the last change to this entry; drives last-write-wins merge. */
  updatedAt?: number;
};

export type UserConfig = {
  address: string;
  spaceIds: string[];
  items?: NavItem[];
  timestamp?: number;
  nonRepudiable?: boolean;
  allowSync?: boolean;
  // Global receipt defaults (per-conversation overrides live on Conversation)
  deliveryReceipts?: boolean;
  readReceipts?: boolean;
  // Global typing indicator defaults
  typingIndicatorsDM?: boolean;
  typingIndicatorsSpaces?: boolean;
  // Sender-side gate for fetching YouTube thumbnails (privacy: leaks sender IP to Google)
  generateYouTubePreviews?: boolean;
  // Device labels keyed by inbox_address, synced across devices
  deviceNames?: { [inboxAddress: string]: string };
  // Tombstones so deleted device names don't resurrect via sync
  deletedDeviceNameAddresses?: string[];
  name?: string;
  profile_image?: string;
  bio?: string;
  isProfilePublic?: boolean;
  // QNS username set as primary (e.g. "alice" for @alice). camelCase to match
  // the other app-level config fields; the wire format uses primary_username on
  // PublicProfile. Synced cross-device so a user's primary username reaches
  // their other devices.
  primaryUsername?: string;
  farcasterLink?: FarcasterLink;
  spaceKeys?: {
    spaceId: string;
    encryptionState: {
      conversationId: string;
      inboxId: string;
      state: string;
      timestamp: number;
    };
    keys: {
      keyId: string;
      address?: string;
      publicKey: string;
      privateKey: string;
      spaceId: string;
    }[];
  }[];
  notificationSettings?: {
    [spaceId: string]: NotificationSettings;
  };
  bookmarks?: Bookmark[];
  deletedBookmarkIds?: string[];
  userNotes?: UserNote[];
  /**
   * @deprecated Carries no deletion time, so a receiver cannot tell an old
   * tombstone from a new one. Still PUBLISHED, so clients predating
   * `deletedUserNotes` keep receiving deletions; new clients must NOT honour it.
   *
   * Why: a client that carries `userNotes` without implementing them (mobile
   * does exactly this) never clears the array, so it republishes the same
   * tombstone in every later save, indefinitely. A receiver applying those
   * unconditionally deletes a note the user re-created, again on every adopt.
   * The blob timestamp cannot substitute for a deletion time either, because it
   * is the carrier's republish time and is therefore always recent.
   */
  deletedUserNoteAddresses?: string[];
  /**
   * User-note tombstones that carry when the deletion happened.
   *
   * A tombstone deletes a note only when the note's own `updatedAt` is older
   * than `deletedAt`. So re-creating a note after deleting it survives, while a
   * stale device still cannot resurrect one that was deleted after it last
   * synced — which is the reason tombstones exist.
   */
  deletedUserNotes?: { targetAddress: string; deletedAt: number }[];
  mutedChannels?: {
    [spaceId: string]: string[];
  };
  showMutedChannels?: boolean;
  hideMutedSpacesFromSidebar?: boolean;
  favoriteDMs?: string[];
  mutedConversations?: string[];
  // Per-conversation DM setting overrides (save-edit-history, always-sign,
  // delivery/read receipts), keyed by conversationId. Synced cross-device;
  // per-entry last-write-wins via each entry's `updatedAt`. See
  // `mergeConversationSettings` / `setConversationSetting` in utils.
  conversationSettings?: {
    [conversationId: string]: ConversationSettingOverrides;
  };
  // Personal "block user": addresses whose messages the viewer hides from their
  // own stream, scoped per space. This is a viewer-side hide (no moderation
  // effect, no permission needed) — distinct from the role-gated moderation mute
  // (MuteMessage). Synced cross-device via the UserConfig blob.
  blockedUsers?: {
    [spaceId: string]: string[];
  };
  spaceTagId?: string;
  lastBroadcastSpaceTag?: {
    letters: string;
    url: string;
  };
};

export type UserProfile = {
  address: string;
  name?: string;
  display_name?: string;
  profile_image?: string;
  bio?: string;
};

export type FarcasterLink = {
  fid: number;
  custodyAddress: string;
  // Farcaster custody wallet signs the Quorum address — proves FC account owns this Quorum identity
  farcasterSignature: string;
  // Quorum Ed448 key signs the Farcaster custody address — proves Quorum identity acknowledges this FC account
  quorumSignature: string;
};

export type PublicProfile = UserProfile & {
  primary_username?: string;
  shared_spaces?: string[];
  isProfilePublic?: boolean;
  farcaster?: FarcasterLink;
};

export type SpaceMember = UserProfile & {
  inbox_address: string;
  isKicked?: boolean;
  joinedAt?: number;
  spaceTag?: BroadcastSpaceTag;
  /** Alias for `address` - matches SDK wire format (channel.UserProfile) and desktop IndexedDB keyPath */
  user_address?: string;
  /** Alias for `profile_image` - matches SDK wire format (channel.UserProfile) */
  user_icon?: string;

  // ── GLOBAL identity slot (two-slot model) ────────────────────────────────
  // The member's current GLOBAL identity, stored separately from the per-space
  // OVERRIDE fields above (`display_name` / `profile_image`). Render precedence
  // is override → global → public profile → address.
  //
  // These matter more than they look: the follow-global work (2026-07-16)
  // deliberately stopped stamping the override fields, so for most members the
  // override slot is EMPTY and the global slot is the identity that renders.
  // Anything that reads a member's identity — including the sync digest — must
  // look here, or it sees nothing for the common case.
  //
  // Previously carried through casts on both platforms; declared here so the
  // sync layer can hash them. (Closes the follow-up noted in the
  // identity-resolution doc.)
  global_display_name?: string;
  /** Desktop storage name. Mobile stores the same value as `global_profile_image`. */
  global_user_icon?: string;
  global_bio?: string;
  /** Per-slot last-write-wins guard for the OVERRIDE fields. */
  profileTimestamp?: number;
  /** Per-slot last-write-wins guard for the GLOBAL slot. */
  globalProfileTimestamp?: number;
};

/**
 * An additional per-device signing key admitted for a space member, proven by
 * a statement signed with the member's master identity key. Stored separately
 * from the member row: it NEVER writes the join-bound `inbox_address` (which
 * stays the sole authority of the verified join). One row per device per space.
 * See utils/deviceKeys.ts for how these are minted, verified, and resolved.
 */
export type SpaceMemberDevice = {
  spaceId: string;
  /** The member this key belongs to (their master user address). */
  userAddress: string;
  /** The device's DM inbox_address — attribution label + revocation handle. Self-asserted (not verified against the hub registration at receive). */
  deviceInboxAddress: string;
  /** Reverse-lookup key: deriveInboxAddress(spaceKeyPublicKey). Matched against a message's signing-key address. */
  inboxAddress: string;
  /** The device's per-space ed448 signing public key (hex). */
  spaceKeyPublicKey: string;
  /** Statement timestamp (ms) — last-write-wins ordering against revocations. */
  timestamp: number;
  /** true once a revoke-device tombstone with timestamp >= this arrived. Kept, never deleted. */
  revoked?: boolean;
};

/**
 * What a config publish attempt did, from the publishing device's point of view.
 *
 * Both clients write the local config row on every save, whatever happened to
 * the upload, so "my setting saved" has never been evidence that it synced.
 * These distinguish the outcomes after the fact.
 */
export type PublishOutcome =
  /** The POST returned. */
  | 'published'
  /** allowSync is false — not publishing is the setting working, not a fault. */
  | 'off'
  /** No keypair available on this device. */
  | 'no-keys'
  /** Refuse-to-publish: the upload would have narrowed the Space list. */
  | 'held'
  /** The server refused it. */
  | 'rejected'
  /** The request timed out client-side. */
  | 'timeout';

/**
 * The last publish attempt on THIS device.
 *
 * Deliberately NOT part of UserConfig, and never sent to the server: it is a
 * fact about one device's relationship with the server. In the synced blob it
 * would broadcast a per-device fact to every other device, rewrite the blob on
 * every save, and grow the very payload it exists to watch.
 *
 * Storage is per-client — localStorage on desktop, MMKV on mobile. Only the
 * shape is shared.
 */
export type LastPublish = {
  /** ms epoch */
  at: number;
  outcome: PublishOutcome;
  /** Ciphertext length, present only when a payload was actually built. */
  payloadBytes?: number;
  spacesPublished?: number;
  /** 'held' only — how many Spaces were missing keys. */
  spacesHeld?: number;
  /** Server message or error text, for 'rejected' and 'timeout'. */
  detail?: string;
};
