/**
 * React Query keys for the Farcaster module. Centralized so invalidators
 * (mutation success handlers, signer renewal, etc.) can hit them without
 * duplicating string literals.
 */

export const farcasterQueryKeys = {
  all: ['farcaster'] as const,
  homeFeed: (fid: number | undefined) =>
    ['farcaster', 'home-feed', { fid }] as const,
  channelFeed: (channelKey: string) =>
    ['farcaster', 'channel-feed', { channelKey }] as const,
  user: (fid: number | undefined) =>
    ['farcaster', 'user', { fid }] as const,
  userByUsername: (username: string | undefined) =>
    ['farcaster', 'user-by-username', { username }] as const,
  usersBulk: (fids: number[]) =>
    ['farcaster', 'users-bulk', { fids: [...fids].sort((a, b) => a - b) }] as const,
  embedEnrichment: (url: string) =>
    ['farcaster', 'embed-enrichment', { url }] as const,
} as const;
