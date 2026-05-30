/**
 * Legacy Farcaster HTTP client — wraps client.farcaster.xyz and
 * farcaster.xyz/~api/v2 endpoints. Used as a fallback when hypersnap
 * cannot serve a request, and as the only path when a user has not
 * opted into a Hypersnap signer.
 */

import { logger } from '../utils/logger';
import type {
  LegacyAuthor,
  LegacyCast,
  LegacyFeedItem,
} from './types';

export const CLIENT_FARCASTER_BASE_URL = 'https://client.farcaster.xyz';
export const FARCASTER_WEB_BASE_URL = 'https://farcaster.xyz/~api/v2';
export const WARPCAST_CLIENT_BASE_URL = 'https://client.warpcast.com';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_HEADERS: Record<string, string> = {
  accept: '*/*',
  origin: 'https://farcaster.xyz',
  referer: 'https://farcaster.xyz/',
};

export class LegacyFarcasterError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'LegacyFarcasterError';
  }
}

export interface LegacyClientConfig {
  /** Optional fetch override (tests). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

interface FetchOpts {
  token?: string;
  body?: unknown;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Body is already a string / FormData / Uint8Array — don't JSON-stringify. */
  raw?: boolean;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface FeedItemsResponse {
  result?: {
    items?: LegacyFeedItem[];
    latestMainCastTimestamp?: number;
  };
}

export interface FeedItemsParams {
  feedKey: 'home' | string;
  feedType?: 'default' | string;
  olderThan?: number;
  latestMainCastTimestamp?: number;
  excludeItemIdPrefixes?: string[];
  castViewEvents?: { ts: number; hash: string; on: string }[];
}

export interface FeedItemsResult {
  items: LegacyFeedItem[];
  latestMainCastTimestamp?: number;
}

interface UserResponse {
  result?: { user?: LegacyAuthor & Record<string, unknown> };
}

interface SubmitCastBody {
  text: string;
  /** Plain URL strings. The server-side validator switched from
   *  `{ url }` objects to flat strings; an object embed now 400s with
   *  `/embeds/0 must be string`. */
  embeds?: string[];
  parent?: { hash: string };
  channelKey?: string;
}

interface CastSubmissionResponse {
  result?: { cast?: LegacyCast };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class LegacyFarcasterClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: LegacyClientConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request<T>(url: string, opts: FetchOpts): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);

    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...(opts.headers ?? {}),
    };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined && !opts.raw) {
      headers['content-type'] = headers['content-type'] ?? 'application/json; charset=utf-8';
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined
          ? undefined
          : opts.raw
            ? (opts.body as BodyInit)
            : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      throw new LegacyFarcasterError(`Legacy Farcaster request failed: ${msg}`, undefined, url);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.text()).slice(0, 500); } catch { /* ignore */ }
      throw new LegacyFarcasterError(
        `Legacy Farcaster HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status,
        url,
      );
    }

    return (await response.json()) as T;
  }

  private newIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // -------------------------------------------------------------------------
  // Feed (home + channel)
  // -------------------------------------------------------------------------

  /**
   * Fetch a page of feed items. `feedKey: 'home'` for the home feed; the
   * channel key (e.g. 'base') for a channel feed.
   */
  async getFeedItems(params: FeedItemsParams, token: string): Promise<FeedItemsResult> {
    const body: Record<string, unknown> = {
      feedKey: params.feedKey,
      feedType: params.feedType ?? 'default',
      updateState: true,
    };
    if (params.olderThan !== undefined) {
      body.olderThan = params.olderThan;
      body.latestMainCastTimestamp = params.latestMainCastTimestamp;
      body.excludeItemIdPrefixes = params.excludeItemIdPrefixes ?? [];
      body.castViewEvents = params.castViewEvents ?? [];
    } else if (params.castViewEvents) {
      body.castViewEvents = params.castViewEvents;
    }

    const res = await this.request<FeedItemsResponse>(
      `${CLIENT_FARCASTER_BASE_URL}/v2/feed-items`,
      {
        method: 'POST',
        body,
        token,
        headers: { 'idempotency-key': this.newIdempotencyKey() },
      },
    );
    return {
      items: res.result?.items ?? [],
      latestMainCastTimestamp: res.result?.latestMainCastTimestamp,
    };
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  async getUserByFid(fid: number, token?: string): Promise<LegacyAuthor | null> {
    const res = await this.request<UserResponse>(
      `${CLIENT_FARCASTER_BASE_URL}/v2/user?fid=${fid}`,
      { token },
    );
    return (res.result?.user as LegacyAuthor) ?? null;
  }

  /**
   * Alternative user-by-fid endpoint that returns extra registration fields.
   */
  async getUserByFidExt(fid: number, token?: string): Promise<LegacyAuthor | null> {
    const res = await this.request<UserResponse>(
      `${CLIENT_FARCASTER_BASE_URL}/v2/user-by-fid?fid=${fid}`,
      { token },
    );
    return (res.result?.user as LegacyAuthor) ?? null;
  }

  async getUserByUsername(username: string, token?: string): Promise<LegacyAuthor | null> {
    const res = await this.request<UserResponse>(
      `${FARCASTER_WEB_BASE_URL}/user-by-username?username=${encodeURIComponent(username)}`,
      { token },
    );
    return (res.result?.user as LegacyAuthor) ?? null;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async submitCast(body: SubmitCastBody, token: string): Promise<LegacyCast | null> {
    // Log the outgoing body before we send. The server response shape
    // (especially around embed acceptance) varies, so a paired
    // log/response pair makes triage trivial — you can see exactly
    // what we sent and what came back without instrumenting deeper.
    logger.log('[legacy] POST /v2/casts body:', JSON.stringify(body));
    try {
      const res = await this.request<CastSubmissionResponse>(
        `${CLIENT_FARCASTER_BASE_URL}/v2/casts`,
        {
          method: 'POST',
          body,
          token,
          headers: { 'idempotency-key': this.newIdempotencyKey() },
        },
      );
      logger.log(
        '[legacy] POST /v2/casts result hash:',
        res.result?.cast?.hash,
        'embeds:',
        JSON.stringify((res.result?.cast as { embeds?: unknown } | undefined)?.embeds),
      );
      return res.result?.cast ?? null;
    } catch (e) {
      logger.warn('[legacy] POST /v2/casts failed:', e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async deleteCast(castHash: string, token: string): Promise<void> {
    await this.request(
      `${CLIENT_FARCASTER_BASE_URL}/v2/casts`,
      {
        method: 'DELETE',
        body: { castHash },
        token,
        headers: { 'idempotency-key': this.newIdempotencyKey() },
      },
    );
  }

  async likeCast(castHash: string, token: string): Promise<void> {
    await this.request(
      `${FARCASTER_WEB_BASE_URL}/cast-likes`,
      {
        method: 'PUT',
        body: { castHash },
        token,
        headers: { 'idempotency-key': this.newIdempotencyKey() },
      },
    );
  }

  async unlikeCast(castHash: string, token: string): Promise<void> {
    await this.request(
      `${FARCASTER_WEB_BASE_URL}/cast-likes`,
      {
        method: 'DELETE',
        body: { castHash },
        token,
        headers: { 'idempotency-key': this.newIdempotencyKey() },
      },
    );
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  async updateProfile(
    fields: { displayName?: string; bio?: string; pfp?: string; location?: string; url?: string },
    token: string,
  ): Promise<void> {
    await this.request(
      `${CLIENT_FARCASTER_BASE_URL}/v2/me`,
      { method: 'PATCH', body: fields, token },
    );
  }

  /**
   * Step 1 of pfp upload: ask the server for a Cloudflare upload URL.
   * Returns the URL plus the resulting CDN image id.
   */
  async generateImageUploadUrl(token: string): Promise<{ url: string; imageId: string }> {
    const res = await this.request<{ result?: { url?: string; optimisticImageId?: string } }>(
      `${CLIENT_FARCASTER_BASE_URL}/v1/generate-image-upload-url`,
      { method: 'POST', body: {}, token },
    );
    const url = res.result?.url;
    const imageId = res.result?.optimisticImageId;
    if (!url || !imageId) {
      throw new LegacyFarcasterError('generateImageUploadUrl missing fields', undefined,
        `${CLIENT_FARCASTER_BASE_URL}/v1/generate-image-upload-url`);
    }
    return { url, imageId };
  }
}

let defaultLegacyClient: LegacyFarcasterClient | null = null;
export function getDefaultLegacyClient(): LegacyFarcasterClient {
  if (!defaultLegacyClient) defaultLegacyClient = new LegacyFarcasterClient();
  return defaultLegacyClient;
}
export function setDefaultLegacyClient(client: LegacyFarcasterClient): void {
  defaultLegacyClient = client;
}
