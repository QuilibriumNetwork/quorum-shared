/**
 * Farcaster types — raw shapes from hypersnap (haatz.quilibrium.com) and the
 * legacy farcaster.xyz / client.warpcast.com APIs, plus the normalized union
 * we expose to consumers.
 */

// ---------------------------------------------------------------------------
// Hypersnap raw shapes (snake_case, ISO timestamps, bare embed URLs)
// ---------------------------------------------------------------------------

export interface HypersnapUser {
  object: 'user';
  fid: number;
  username: string;
  display_name: string;
  custody_address: string;
  pfp_url?: string;
  registered_at?: string; // ISO 8601
  profile?: { bio?: { text?: string } };
  follower_count?: number;
  following_count?: number;
  verifications?: string[]; // mixed eth + sol addresses
  auth_addresses?: string[];
  verified_addresses?: {
    eth_addresses?: string[];
    sol_addresses?: string[];
    primary?: { eth_address?: string; sol_address?: string };
  };
  verified_accounts?: unknown[];
  viewer_context?: { following?: boolean; followed_by?: boolean };
}

export type HypersnapEmbed =
  | { url: string }
  | { cast_id: { fid: number; hash: string } };

export interface HypersnapCastReactions {
  likes_count: number;
  recasts_count: number;
  likes: { fid: number }[];
  recasts: { fid: number }[];
}

export interface HypersnapTextRange {
  start: number;
  end: number;
}

export interface HypersnapChannelRef {
  id: string;
  name: string;
  image_url?: string;
}

export interface HypersnapCast {
  object: 'cast';
  hash: string;
  parent_hash?: string;
  parent_url?: string;
  root_parent_url?: string;
  parent_author: { fid: number | null };
  author: HypersnapUser;
  text: string;
  timestamp: string; // ISO 8601
  embeds: HypersnapEmbed[];
  type: 'cast' | 'cast-reply' | string;
  reactions: HypersnapCastReactions;
  replies: { count: number };
  thread_hash?: string;
  mentioned_profiles: HypersnapUser[];
  mentioned_profiles_ranges: HypersnapTextRange[];
  mentioned_channels: HypersnapChannelRef[];
  mentioned_channels_ranges: HypersnapTextRange[];
  channel?: HypersnapChannelRef;
  viewer_context?: { liked?: boolean; recasted?: boolean };
}

export interface HypersnapFeedResponse {
  casts: HypersnapCast[];
  next: { cursor: string | null };
}

export interface HypersnapUserResponse {
  user: HypersnapUser;
}

export interface HypersnapUsersBulkResponse {
  users: HypersnapUser[];
}

export interface HypersnapCastResponse {
  cast: HypersnapCast;
}

/** A cast in a conversation tree — same as HypersnapCast, plus nested
 *  `direct_replies` (recursively, up to the request's `reply_depth`). */
export interface HypersnapConversationCast extends HypersnapCast {
  direct_replies?: HypersnapConversationCast[];
}

export interface HypersnapConversationResponse {
  conversation: {
    cast: HypersnapConversationCast;
  };
}

// ---------------------------------------------------------------------------
// Legacy farcaster.xyz / client.warpcast.com shapes.
// ---------------------------------------------------------------------------

export interface LegacyEmbeddedImage {
  url?: string;
  alt?: string;
}

export interface LegacyEmbeddedVideo {
  url?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  type?: string;
}

export interface LegacyFrameEmbed {
  version?: string;
  imageUrl?: string;
  button?: {
    title?: string;
    action?: {
      type?: string;
      name?: string;
      url?: string;
      splashImageUrl?: string;
      splashBackgroundColor?: string;
    };
  };
}

export interface LegacyEmbeddedUrl {
  type?: string;
  openGraph?: {
    url?: string;
    sourceUrl?: string;
    title?: string;
    description?: string;
    domain?: string;
    image?: string;
    useLargeImage?: boolean;
    frameEmbedNext?: {
      frameUrl?: string;
      frameEmbed?: LegacyFrameEmbed;
    };
  };
}

export interface LegacyEmbeddedCast {
  hash: string;
  threadHash?: string;
  author: LegacyAuthor;
  text: string;
  timestamp: number;
  embeds?: {
    images?: LegacyEmbeddedImage[];
    videos?: LegacyEmbeddedVideo[];
  };
  replies?: { count?: number };
  reactions?: { count?: number };
  recasts?: { count?: number };
  viewerContext?: { reacted?: boolean; recast?: boolean };
}

export interface LegacyAuthor {
  fid: number;
  displayName: string;
  username: string;
  pfp?: { url?: string; verified?: boolean };
  profile?: {
    bio?: { text?: string };
    accountLevel?: string;
  };
  followerCount?: number;
  followingCount?: number;
  viewerContext?: { following?: boolean; followedBy?: boolean };
}

export interface LegacyCast {
  hash: string;
  threadHash?: string;
  parentHash?: string;
  parentUrl?: string;
  timestamp: number;
  text: string;
  author: LegacyAuthor;
  tags?: { type?: string; id?: string; name?: string }[];
  channel?: { key?: string; name?: string; imageUrl?: string };
  embeds?: {
    images?: LegacyEmbeddedImage[];
    videos?: LegacyEmbeddedVideo[];
    urls?: LegacyEmbeddedUrl[];
    casts?: LegacyEmbeddedCast[];
  };
  replies?: { count?: number };
  reactions?: { count?: number };
  recasts?: { count?: number };
  viewerContext?: { reacted?: boolean; recast?: boolean };
}

export interface LegacyFeedItem {
  id: string;
  timestamp: number;
  cast: LegacyCast;
}

// ---------------------------------------------------------------------------
// Normalized shapes — what consumers see. Superset of both raw shapes.
// Sources may leave any non-required field undefined.
// ---------------------------------------------------------------------------

/** Source of the normalized record, useful for fallback diagnostics. */
export type FarcasterSource = 'hypersnap' | 'legacy';

export interface NormalizedAuthor {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  /** Whether the viewing user follows this author. Requires auth — on the
   *  hypersnap unauth read path this stays undefined unless filled via the
   *  viewer overlay. */
  viewerFollows?: boolean;
  /** Inverse direction. */
  viewerFollowedBy?: boolean;
  /** Custody address — only populated on the hypersnap path. */
  custodyAddress?: string;
  /** Verified addresses — only populated on the hypersnap path. */
  verifiedEthAddresses?: string[];
  verifiedSolAddresses?: string[];
  primaryEthAddress?: string;
  primarySolAddress?: string;
}

export interface NormalizedEmbed {
  /** Always populated for URL embeds. */
  url?: string;
  /** Cast-quote embed. */
  castId?: { fid: number; hash: string };
  /** OG metadata. Populated on the legacy path; on the hypersnap path it is
   *  filled lazily by useEnrichEmbeds. */
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    domain?: string;
    sourceUrl?: string;
  };
  /** Image embed (legacy-shaped or enriched). */
  image?: { url?: string; alt?: string };
  /** Video embed (legacy-shaped or enriched). */
  video?: { url?: string; thumbnailUrl?: string; sourceUrl?: string; width?: number; height?: number };
  /** Farcaster Frame embed. */
  frame?: LegacyFrameEmbed;
}

export interface NormalizedCast {
  /** Cast hash, lowercased hex, 0x-prefixed. */
  hash: string;
  /** Parent cast hash (for replies). 0x-prefixed when present. */
  parentHash?: string;
  /** Parent URL (channel cast, or external URL the cast replies to). */
  parentUrl?: string;
  /** Author of the parent cast — only the FID is reliably available from
   *  hypersnap; username/displayName are looked up separately. */
  parentAuthor?: { fid: number };
  /** Thread root hash. */
  threadHash?: string;
  /** Milliseconds since epoch. */
  timestamp: number;
  text: string;
  author: NormalizedAuthor;
  embeds: NormalizedEmbed[];
  /** Mentioned-profile FIDs aligned with mentionsPositions. */
  mentions: number[];
  /** Byte offsets of each mention in `text`. */
  mentionsPositions: number[];
  channel?: { key: string; name: string; imageUrl?: string };
  reactions: {
    likesCount: number;
    recastsCount: number;
    repliesCount: number;
    /** Whether the viewing user liked this cast. */
    viewerLiked?: boolean;
    /** Whether the viewing user recasted. */
    viewerRecasted?: boolean;
  };
  /** Where this record came from. */
  source: FarcasterSource;
}

export interface NormalizedUser extends NormalizedAuthor {
  source: FarcasterSource;
  registeredAt?: number; // ms since epoch
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce an ISO 8601 timestamp or a millisecond number into ms-since-epoch.
 */
export function timestampToMs(t: string | number | undefined): number {
  if (t === undefined) return 0;
  if (typeof t === 'number') return t;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : 0;
}

/** Normalize a Farcaster cast hash to 0x-prefixed lowercase hex. */
export function normalizeHash(hash: string): string {
  const lower = hash.toLowerCase();
  return lower.startsWith('0x') ? lower : `0x${lower}`;
}
