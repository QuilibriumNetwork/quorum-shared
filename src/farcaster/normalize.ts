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

function fromHypersnapEmbeds(embeds: HypersnapCast['embeds']): NormalizedEmbed[] {
  return embeds.map((e): NormalizedEmbed => {
    if ('url' in e) return { url: e.url };
    return { castId: { fid: e.cast_id.fid, hash: normalizeHash(e.cast_id.hash) } };
  });
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
    threadHash: c.thread_hash ? normalizeHash(c.thread_hash) : undefined,
    timestamp: timestampToMs(c.timestamp),
    text: c.text,
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
