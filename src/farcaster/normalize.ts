/**
 * Convert raw hypersnap / legacy Farcaster responses into the NormalizedCast
 * and NormalizedUser shapes consumed by hooks and UI.
 *
 * The normalizers never invent data — if a field is missing from the source,
 * it remains undefined on the result. Mergers later can layer enrichment
 * (OG metadata, viewer overlay) on top.
 */

import {
  normalizeHash,
  timestampToMs,
  type HypersnapCast,
  type HypersnapUser,
  type LegacyAuthor,
  type LegacyCast,
  type LegacyFeedItem,
  type NormalizedAuthor,
  type NormalizedCast,
  type NormalizedEmbed,
  type NormalizedUser,
} from './types';

// ---------------------------------------------------------------------------
// User / author normalization
// ---------------------------------------------------------------------------

export function fromHypersnapUser(u: HypersnapUser): NormalizedUser {
  const author: NormalizedAuthor = {
    fid: u.fid,
    username: u.username,
    displayName: u.display_name ?? '',
    pfpUrl: u.pfp_url,
    bio: u.profile?.bio?.text,
    followerCount: u.follower_count,
    followingCount: u.following_count,
    viewerFollows: u.viewer_context?.following,
    viewerFollowedBy: u.viewer_context?.followed_by,
    custodyAddress: u.custody_address,
    verifiedEthAddresses: u.verified_addresses?.eth_addresses,
    verifiedSolAddresses: u.verified_addresses?.sol_addresses,
    primaryEthAddress: u.verified_addresses?.primary?.eth_address,
    primarySolAddress: u.verified_addresses?.primary?.sol_address,
  };
  const registeredAt = u.registered_at ? timestampToMs(u.registered_at) : undefined;
  return {
    ...author,
    source: 'hypersnap',
    registeredAt: registeredAt && registeredAt > 0 ? registeredAt : undefined,
  };
}

export function fromLegacyUser(u: LegacyAuthor): NormalizedUser {
  const author: NormalizedAuthor = {
    fid: u.fid,
    username: u.username,
    displayName: u.displayName ?? '',
    pfpUrl: u.pfp?.url,
    bio: u.profile?.bio?.text,
    followerCount: u.followerCount,
    followingCount: u.followingCount,
    viewerFollows: u.viewerContext?.following,
    viewerFollowedBy: u.viewerContext?.followedBy,
  };
  return { ...author, source: 'legacy' };
}

function fromHypersnapAuthor(u: HypersnapUser): NormalizedAuthor {
  return fromHypersnapUser(u);
}

function fromLegacyAuthor(u: LegacyAuthor): NormalizedAuthor {
  return fromLegacyUser(u);
}

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

// Heuristics for classifying hypersnap's bare-URL embeds. Hypersnap doesn't
// run OG enrichment server-side, so the only signal we have is the URL
// itself. We look at the extension and known image-CDN hosts.
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|m3u8)(\?|$)/i;
const KNOWN_IMAGE_HOSTS = new Set([
  'imagedelivery.net',
  'i.imgur.com',
  'pbs.twimg.com',
  'media.farcaster.xyz',
]);

function classifyBareUrl(url: string): NormalizedEmbed {
  let host: string | undefined;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { url };
  }
  if (IMAGE_EXT_RE.test(url) || (host && KNOWN_IMAGE_HOSTS.has(host))) {
    return { url, image: { url } };
  }
  if (VIDEO_EXT_RE.test(url)) {
    return { url, video: { url } };
  }
  return { url };
}

/**
 * Try to read a Farcaster cast hash out of a `farcaster.xyz/<user>/0x<hash>`
 * URL so we can dedupe a URL embed against a sibling cast_id embed that
 * points at the same cast. The farcaster.xyz app sometimes ships both
 * forms in the same cast — protocol-allowed, but visually it just renders
 * the same quote twice.
 */
function castHashFromFarcasterUrl(url: string): string | null {
  const m = url.match(/farcaster\.xyz\/[^\/]+\/(0x[a-fA-F0-9]+)/);
  return m ? m[1].toLowerCase() : null;
}

function fromHypersnapEmbeds(embeds: HypersnapCast['embeds']): NormalizedEmbed[] {
  const out: NormalizedEmbed[] = [];
  const seenUrls = new Set<string>();
  const seenCastHashes = new Set<string>();
  // First pass: collect cast_id hashes so we can suppress URL embeds that
  // duplicate them. Hypersnap doesn't dedupe across embed types.
  for (const e of embeds) {
    if ('cast_id' in e) {
      seenCastHashes.add(normalizeHash(e.cast_id.hash).toLowerCase());
    }
  }
  for (const e of embeds) {
    if ('url' in e) {
      // Skip duplicate URL strings (farcaster.xyz client bug repeats them).
      const key = e.url;
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      // Skip farcaster.xyz cast links when the same cast is already
      // attached as a cast_id embed.
      const farcasterHash = castHashFromFarcasterUrl(e.url);
      if (farcasterHash) {
        const full = farcasterHash.startsWith('0x') ? farcasterHash : `0x${farcasterHash}`;
        const dupExists = Array.from(seenCastHashes).some(
          (h) => h.startsWith(full) || full.startsWith(h),
        );
        if (dupExists) continue;
      }
      out.push(classifyBareUrl(e.url));
      continue;
    }
    const hash = normalizeHash(e.cast_id.hash).toLowerCase();
    // Dedupe sibling cast_id embeds.
    if (seenUrls.has(`__cast:${hash}`)) continue;
    seenUrls.add(`__cast:${hash}`);
    out.push({ castId: { fid: e.cast_id.fid, hash: normalizeHash(e.cast_id.hash) } });
  }
  return out;
}

function fromLegacyEmbeds(embeds: LegacyCast['embeds']): NormalizedEmbed[] {
  if (!embeds) return [];
  const out: NormalizedEmbed[] = [];

  for (const img of embeds.images ?? []) {
    out.push({ image: { url: img.url, alt: img.alt }, url: img.url });
  }
  for (const vid of embeds.videos ?? []) {
    out.push({
      video: {
        url: vid.url,
        thumbnailUrl: vid.thumbnailUrl,
        sourceUrl: vid.sourceUrl,
        width: vid.width,
        height: vid.height,
      },
      url: vid.url,
    });
  }
  for (const u of embeds.urls ?? []) {
    const og = u.openGraph;
    out.push({
      url: og?.url ?? og?.sourceUrl,
      openGraph: og
        ? {
            title: og.title,
            description: og.description,
            image: og.image,
            domain: og.domain,
            sourceUrl: og.sourceUrl,
          }
        : undefined,
      frame: og?.frameEmbedNext?.frameEmbed,
    });
  }
  for (const c of embeds.casts ?? []) {
    out.push({ castId: { fid: c.author.fid, hash: normalizeHash(c.hash) } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mention substitution (hypersnap-only)
// ---------------------------------------------------------------------------

/**
 * Hypersnap returns cast text with @-mentions stripped out and the FID +
 * byte-offset stored separately in `mentioned_profiles` /
 * `mentioned_profiles_ranges`. Legacy returns text with @usernames already
 * inline. To keep the renderer simple we substitute the @usernames into the
 * text here so all downstream code sees the same shape.
 *
 * Positions are UTF-8 byte offsets, not JS character offsets — `é`, curly
 * quotes, emoji, etc. occupy multiple bytes. We convert each byte offset
 * to its JS char index by decoding the byte prefix.
 */
function byteOffsetToCharOffset(text: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0;
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  if (byteOffset >= bytes.length) return text.length;
  const prefix = new TextDecoder().decode(bytes.subarray(0, byteOffset));
  return prefix.length;
}

export function substituteHypersnapMentions(
  text: string,
  ranges: { start: number }[],
  profiles: { username: string; fid: number }[],
): string {
  if (ranges.length === 0 || profiles.length === 0) return text;
  // Pair each range with its profile (by index — hypersnap guarantees
  // alignment) and skip any with a missing username.
  const insertions = ranges
    .map((r, i) => {
      const profile = profiles[i];
      if (!profile?.username) return null;
      return { byteOffset: r.start, handle: `@${profile.username}` };
    })
    .filter((x): x is { byteOffset: number; handle: string } => x !== null)
    // Insert right-to-left so earlier char offsets stay valid as we mutate.
    .sort((a, b) => b.byteOffset - a.byteOffset);

  let result = text;
  for (const ins of insertions) {
    // Always resolve against the ORIGINAL text — byte offsets are reported
    // pre-substitution. Computing this once per insertion is fine since
    // mentions per cast are typically <5.
    const charOffset = byteOffsetToCharOffset(text, ins.byteOffset);
    // Adjust char offset for prior right-side insertions: since we walk
    // right-to-left, all not-yet-applied insertions are to the LEFT of
    // this one, so we don't need to shift. But applied insertions are to
    // the RIGHT, so the prefix length up to charOffset hasn't changed.
    result = result.slice(0, charOffset) + ins.handle + result.slice(charOffset);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Casts
// ---------------------------------------------------------------------------

export function fromHypersnapCast(c: HypersnapCast): NormalizedCast {
  // Hypersnap aligns mentioned_profiles[i] with mentioned_profiles_ranges[i].
  const mentions = c.mentioned_profiles.map((p) => p.fid);
  const mentionsPositions = c.mentioned_profiles_ranges.map((r) => r.start);

  return {
    hash: normalizeHash(c.hash),
    parentHash: c.parent_hash ? normalizeHash(c.parent_hash) : undefined,
    parentUrl: c.parent_url,
    parentAuthor: c.parent_author?.fid != null
      ? { fid: c.parent_author.fid }
      : undefined,
    threadHash: c.thread_hash ? normalizeHash(c.thread_hash) : undefined,
    timestamp: timestampToMs(c.timestamp),
    text: substituteHypersnapMentions(
      c.text,
      c.mentioned_profiles_ranges,
      c.mentioned_profiles,
    ),
    author: fromHypersnapAuthor(c.author),
    embeds: fromHypersnapEmbeds(c.embeds),
    mentions,
    mentionsPositions,
    channel: c.channel
      ? { key: c.channel.id, name: c.channel.name, imageUrl: c.channel.image_url }
      : undefined,
    reactions: {
      likesCount: c.reactions.likes_count,
      recastsCount: c.reactions.recasts_count,
      repliesCount: c.replies.count,
      viewerLiked: c.viewer_context?.liked,
      viewerRecasted: c.viewer_context?.recasted,
    },
    source: 'hypersnap',
  };
}

export function fromLegacyCast(c: LegacyCast): NormalizedCast {
  return {
    hash: normalizeHash(c.hash),
    parentHash: c.parentHash ? normalizeHash(c.parentHash) : undefined,
    parentUrl: c.parentUrl,
    // Legacy v2/feed-items doesn't expose parent author FID on the cast,
    // so this stays undefined on the legacy path.
    parentAuthor: undefined,
    threadHash: c.threadHash ? normalizeHash(c.threadHash) : undefined,
    timestamp: timestampToMs(c.timestamp),
    text: c.text,
    author: fromLegacyAuthor(c.author),
    embeds: fromLegacyEmbeds(c.embeds),
    // Legacy doesn't surface FID-keyed mentions on the feed item; leave empty.
    // The text already contains @-handles and our renderer parses them.
    mentions: [],
    mentionsPositions: [],
    channel: c.channel?.key && c.channel?.name
      ? { key: c.channel.key, name: c.channel.name, imageUrl: c.channel.imageUrl }
      : undefined,
    reactions: {
      likesCount: c.reactions?.count ?? 0,
      recastsCount: c.recasts?.count ?? 0,
      repliesCount: c.replies?.count ?? 0,
      viewerLiked: c.viewerContext?.reacted,
      viewerRecasted: c.viewerContext?.recast,
    },
    source: 'legacy',
  };
}

export function fromLegacyFeedItem(item: LegacyFeedItem): NormalizedCast {
  return fromLegacyCast(item.cast);
}

// ---------------------------------------------------------------------------
// Mergers (for overlays / enrichment)
// ---------------------------------------------------------------------------

/**
 * Layer viewer-specific reaction flags onto an existing normalized cast.
 * Used by the viewer overlay after the cast was fetched anonymously.
 */
export function withViewerOverlay(
  cast: NormalizedCast,
  overlay: { viewerLiked?: boolean; viewerRecasted?: boolean },
): NormalizedCast {
  return {
    ...cast,
    reactions: {
      ...cast.reactions,
      viewerLiked: overlay.viewerLiked ?? cast.reactions.viewerLiked,
      viewerRecasted: overlay.viewerRecasted ?? cast.reactions.viewerRecasted,
    },
  };
}

/**
 * Layer OG / frame / image enrichment onto an embed whose `url` matches.
 * Returns a new cast with enriched embeds in place.
 */
export function withEmbedEnrichment(
  cast: NormalizedCast,
  enriched: Partial<NormalizedEmbed> & { url: string },
): NormalizedCast {
  let touched = false;
  const next = cast.embeds.map((e) => {
    if (e.url && e.url === enriched.url) {
      touched = true;
      return { ...e, ...enriched };
    }
    return e;
  });
  return touched ? { ...cast, embeds: next } : cast;
}
