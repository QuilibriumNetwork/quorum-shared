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
  deletedUserNoteAddresses?: string[];
  mutedChannels?: {
    [spaceId: string]: string[];
  };
  showMutedChannels?: boolean;
  hideMutedSpacesFromSidebar?: boolean;
  favoriteDMs?: string[];
  mutedConversations?: string[];
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
