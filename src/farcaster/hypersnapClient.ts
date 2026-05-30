/**
 * Hypersnap (haatz.quilibrium.com) HTTP client.
 *
 * Public, no auth required. All endpoints return JSON modelled in
 * ./types.ts.
 */

import { logger } from '../utils/logger';
import type {
  HypersnapCast,
  HypersnapCastResponse,
  HypersnapConversationResponse,
  HypersnapFeedResponse,
  HypersnapUser,
  HypersnapUserResponse,
  HypersnapUsersBulkResponse,
} from './types';

export const DEFAULT_HYPERSNAP_BASE_URL = 'https://haatz.quilibrium.com';

export interface HypersnapClientConfig {
  baseUrl?: string;
  /** Per-request timeout in ms. Default 10s; channel/trending endpoints may
   *  exceed this so callers can override per-call. */
  timeoutMs?: number;
  /** Optional fetch implementation override (tests). */
  fetchImpl?: typeof fetch;
}

export class HypersnapError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'HypersnapError';
  }
}

export interface PageOptions {
  cursor?: string;
  limit?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_LIMIT = 100;

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return 25;
  return Math.min(Math.floor(limit as number), MAX_LIMIT);
}

export class HypersnapClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: HypersnapClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_HYPERSNAP_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async get<T>(path: string, query: Record<string, string | number | undefined>, opts: { timeoutMs?: number } = {}): Promise<T> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      throw new HypersnapError(`Hypersnap request failed: ${msg}`, undefined, url);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 500);
      } catch { /* ignore */ }
      throw new HypersnapError(
        `Hypersnap ${response.status} on ${path}${detail ? `: ${detail}` : ''}`,
        response.status,
        url,
      );
    }

    return (await response.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  async getUserByFid(fid: number): Promise<HypersnapUser> {
    const res = await this.get<HypersnapUserResponse>('/v2/farcaster/user', { fid });
    return res.user;
  }

  async getUserByUsername(username: string): Promise<HypersnapUser> {
    const res = await this.get<HypersnapUserResponse>('/v2/farcaster/user/by-username', { username });
    return res.user;
  }

  async getUsersBulk(fids: number[]): Promise<HypersnapUser[]> {
    if (fids.length === 0) return [];
    const res = await this.get<HypersnapUsersBulkResponse>('/v2/farcaster/user/bulk', {
      fids: fids.join(','),
    });
    return res.users;
  }

  // -------------------------------------------------------------------------
  // Feeds
  // -------------------------------------------------------------------------

  async getFollowingFeed(fid: number, opts: PageOptions = {}): Promise<HypersnapFeedResponse> {
    return this.get('/v2/farcaster/feed/following', {
      fid,
      cursor: opts.cursor,
      limit: clampLimit(opts.limit),
    });
  }

  /**
   * Trending feed. Often slow; caller may pass a larger timeoutMs.
   */
  async getTrendingFeed(opts: PageOptions & { timeoutMs?: number } = {}): Promise<HypersnapFeedResponse> {
    return this.get(
      '/v2/farcaster/feed/trending',
      { cursor: opts.cursor, limit: clampLimit(opts.limit) },
      { timeoutMs: opts.timeoutMs },
    );
  }

  async getChannelFeed(channelIds: string[], opts: PageOptions = {}): Promise<HypersnapFeedResponse> {
    if (channelIds.length === 0) return { casts: [], next: { cursor: null } };
    return this.get('/v2/farcaster/feed/channels', {
      channel_ids: channelIds.join(','),
      cursor: opts.cursor,
      limit: clampLimit(opts.limit),
    });
  }

  async getUserCasts(fid: number, opts: PageOptions = {}): Promise<HypersnapFeedResponse> {
    return this.get('/v2/farcaster/feed/user/casts', {
      fid,
      cursor: opts.cursor,
      limit: clampLimit(opts.limit),
    });
  }

  async getUserReplies(fid: number, opts: PageOptions = {}): Promise<HypersnapFeedResponse> {
    return this.get('/v2/farcaster/feed/user/replies_and_recasts', {
      fid,
      cursor: opts.cursor,
      limit: clampLimit(opts.limit),
    });
  }

  // -------------------------------------------------------------------------
  // Cast lookup
  // -------------------------------------------------------------------------

  /**
   * Look up a single cast by hash + author FID. The hash should be hex
   * (with or without 0x prefix); we strip 0x since the server rejects the
   * prefixed form.
   */
  async getCastByHash(fid: number, hash: string): Promise<HypersnapCast> {
    const stripped = hash.toLowerCase().startsWith('0x') ? hash.slice(2) : hash;
    const res = await this.get<HypersnapCastResponse>('/v2/farcaster/cast', {
      identifier: stripped,
      type: 'hash',
      fid,
    });
    return res.cast;
  }

  /**
   * Fetch the conversation tree rooted at a cast. The response includes
   * the root cast plus `direct_replies` (recursively, up to `reply_depth`).
   * `reply_depth` is clamped to 5 server-side; pass 0 to skip replies.
   */
  async getCastConversation(
    hash: string,
    opts: { replyDepth?: number } = {},
  ): Promise<HypersnapConversationResponse> {
    const stripped = hash.toLowerCase().startsWith('0x') ? hash.slice(2) : hash;
    return this.get<HypersnapConversationResponse>('/v2/farcaster/cast/conversation', {
      identifier: stripped,
      type: 'hash',
      reply_depth: opts.replyDepth ?? 5,
    });
  }

  /**
   * Look up channel metadata by its `parent_url` identifier (the URI form
   * casts carry — legacy `https://warpcast.com/~/channel/<slug>` or newer
   * Zora/Optimism `chain://eip155:<chain>/erc721:<contract>` URIs).
   */
  async getChannelByParentUrl(parentUrl: string): Promise<{
    id: string;
    name: string;
    url?: string;
    parent_url?: string;
    image_url?: string;
    description?: string;
    member_count?: number;
  } | null> {
    try {
      const res = await this.get<{ channel?: {
        id: string;
        name: string;
        url?: string;
        parent_url?: string;
        image_url?: string;
        description?: string;
        member_count?: number;
      } }>(
        '/v2/farcaster/channel',
        { id: parentUrl, type: 'parent_url' },
      );
      return res.channel ?? null;
    } catch {
      return null;
    }
  }

  /**
   * List Ed25519 signers hypersnap currently considers valid for the
   * given FID — including both Optimism on-chain (KeyRegistry events)
   * AND off-chain gasless KEY_ADD messages submitted via
   * `/v1/submitMessage`. Endpoint: `GET /v1/signersByFid?fid=N`.
   *
   * NOTE: an earlier draft of this method called `/v2/farcaster/signer`,
   * which only enumerates the on-chain (KeyRegistry) subset. That
   * caused every app launch to think our just-provisioned gasless
   * signer was missing and reprovision again. The correct list
   * endpoint is `/v1/signersByFid`, which returns both sources.
   *
   * Response shape:
   *   {
   *     signers: [{ source, key: "0x<hex>", keyType, fid, addedAt, ttl, ... }, ...],
   *     gaslessSignerCount: N,
   *     gaslessSignerLimit: N,
   *     ...
   *   }
   *
   * Returns the pubkey hex strings (lowercase, no `0x` prefix). Empty
   * array on transport / shape failure; the caller should treat empty
   * as "unknown" rather than "absent" so a transient hub error doesn't
   * trigger a destructive reprovision.
   */
  async listSnapchainSignersByFid(fid: number): Promise<string[]> {
    interface HttpSigner {
      key?: string;
      keyType?: number;
      source?: string;
      fid?: number;
      addedAt?: number;
      expiresAt?: number;
    }
    interface SignersByFidResponse {
      signers?: HttpSigner[];
      nextPageToken?: string;
      gaslessSignerCount?: number;
      gaslessSignerLimit?: number;
    }
    const path = `/v1/signersByFid?fid=${fid}`;
    try {
      const url = `${this.baseUrl}${path}`;
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        logger.warn(`[hypersnap] GET ${path} -> ${response.status}`);
        return [];
      }
      const json = (await response.json()) as SignersByFidResponse;
      const signers = json.signers ?? [];
      const keys = signers
        .map((s) => s.key)
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
        .map((k) => k.toLowerCase().replace(/^0x/, ''));
      logger.log(
        `[hypersnap] GET ${path} -> ${keys.length} signer(s) (gasless: ${json.gaslessSignerCount ?? '?'}/${json.gaslessSignerLimit ?? '?'})`,
      );
      return keys;
    } catch (e) {
      logger.warn(`[hypersnap] GET ${path} threw:`, e instanceof Error ? e.message : String(e));
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Submit a protobuf-encoded Farcaster `Message` to the network.
   * Body must already be octet-stream bytes from messageBuilder.
   */
  async submitMessage(body: Uint8Array, opts: { timeoutMs?: number } = {}): Promise<unknown> {
    const url = `${this.baseUrl}/v1/submitMessage`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);

    // Encode the protobuf bytes as base64 in the log so a failing
    // submission can be replayed (e.g. against a local node) without
    // re-running the signing flow.
    let envelopeBase64 = '';
    try {
      let bin = '';
      for (let i = 0; i < body.length; i++) bin += String.fromCharCode(body[i]);
      envelopeBase64 =
        typeof (globalThis as { btoa?: (s: string) => string }).btoa === 'function'
          ? (globalThis as { btoa: (s: string) => string }).btoa(bin)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : (globalThis as any).Buffer
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (globalThis as any).Buffer.from(body).toString('base64')
            : '';
    } catch { /* ignore */ }
    logger.log(
      '[hypersnap] POST /v1/submitMessage',
      JSON.stringify({ bytes: body.length, base64: envelopeBase64 }),
    );

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', accept: 'application/json' },
        // Uint8Array is a valid BodyInit at runtime; the lib.dom type union
        // explicitly excludes it on some TS configurations, so widen via
        // `unknown` to BodyInit.
        body: body as unknown as BodyInit,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      throw new HypersnapError(`submitMessage failed: ${msg}`, undefined, url);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.text()).slice(0, 500); } catch { /* ignore */ }
      logger.warn(
        '[hypersnap] POST /v1/submitMessage failed:',
        response.status,
        detail,
      );
      throw new HypersnapError(
        `submitMessage HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status,
        url,
      );
    }

    const json = await response.json();
    logger.log('[hypersnap] POST /v1/submitMessage ok');
    return json;
  }
}

/** Singleton with default config; convenient for callers that don't need
 *  a custom baseUrl. */
let defaultClient: HypersnapClient | null = null;
export function getDefaultHypersnapClient(): HypersnapClient {
  if (!defaultClient) defaultClient = new HypersnapClient();
  return defaultClient;
}

/** Reset the singleton (useful for tests / runtime base-url switching). */
export function setDefaultHypersnapClient(client: HypersnapClient): void {
  defaultClient = client;
}
