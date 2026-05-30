/**
 * useSubmitCast — post a cast via hypersnap when a valid signer is
 * present, else (and on any failure) fall back to the legacy
 * client.farcaster.xyz /v2/casts endpoint.
 */

import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import {
  buildSignedMessage,
  CastType,
  FarcasterNetwork,
  MessageType,
  type CastEmbed,
} from '../messageBuilder';
import { hexToBytes } from '../signedKeyRequest';
import { signerFromRecord } from '../signerLifecycle';
import type { SignerStore } from '../signerStore';
import { farcasterQueryKeys } from './queryKeys';
import { logger } from '../../utils/logger';

export interface SubmitCastParams {
  text: string;
  embeds?: CastEmbed[];
  mentions?: number[];
  mentionsPositions?: number[];
  parent?:
    | { castHashHex: string; fid?: number }
    | { url: string };
  /** Optional channel key — mapped to a parent URL by the host since
   *  Farcaster channel URLs are well-known (chains://...). */
  channelKey?: string;
  /** Resolver from channelKey to a parent URL, when channelKey is set. */
  channelKeyToUrl?: (key: string) => string;
  /** Resolver from a `{castId}` embed back to a sharable URL. Needed
   *  for the legacy path, which only accepts string embeds. When the
   *  caller had translated a `farcaster.xyz/<user>/<hash>` URL into a
   *  `{castId}` embed up front (the hypersnap path's preferred shape),
   *  we need the reverse so the legacy fallback can emit the same
   *  URL the user originally pasted. */
  castIdToUrl?: (castId: { fid: number; hash: Uint8Array }) => string | undefined;
  /** Cast type — default CAST (320 bytes). */
  type?: CastType;
}

export type SubmitCastSource = 'hypersnap' | 'legacy';

export interface SubmitCastResult {
  source: SubmitCastSource;
  /** 0x-prefixed hex of the cast hash. Computed from the signed envelope
   *  on the hypersnap path; parsed from `result.hash` on the legacy path.
   *  Empty string if the legacy response didn't surface it. */
  hash: string;
  /** Raw response payload from whichever path succeeded. */
  response: unknown;
}

export interface UseSubmitCastOptions {
  fid: number | undefined;
  /** Bearer token used on the legacy fallback path. */
  token?: string;
  signerStore?: SignerStore;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  network?: FarcasterNetwork;
  mutation?: Omit<UseMutationOptions<SubmitCastResult, Error, SubmitCastParams>, 'mutationFn'>;
}

function resolveParent(
  p: SubmitCastParams,
): { castId: { fid: number; hash: Uint8Array } } | { url: string } | undefined {
  if (!p.parent) return p.channelKey && p.channelKeyToUrl
    ? { url: p.channelKeyToUrl(p.channelKey) }
    : undefined;
  if ('url' in p.parent) return { url: p.parent.url };
  return {
    castId: {
      fid: p.parent.fid as number,
      hash: hexToBytes(p.parent.castHashHex),
    },
  };
}

/** Returns true when the caller provided a reply-by-hash parent but no
 *  FID. The hypersnap protocol requires the parent author's FID to build
 *  a `castId` reply target, so we can't sign such a cast; the legacy
 *  endpoint accepts hash-only, so route there instead. */
function isParentMissingFid(p: SubmitCastParams): boolean {
  return !!p.parent && 'castHashHex' in p.parent && typeof p.parent.fid !== 'number';
}

async function submitViaHypersnap(
  params: SubmitCastParams,
  ctx: {
    fid: number;
    signerStore: SignerStore;
    hypersnap: HypersnapClient;
    network: FarcasterNetwork;
  },
): Promise<SubmitCastResult | null> {
  const record = await ctx.signerStore.get();
  if (!record) {
    logger.warn('[useSubmitCast/hypersnap] no signer record in store');
    return null;
  }
  if (record.fid !== ctx.fid) {
    logger.warn(
      `[useSubmitCast/hypersnap] signer record fid=${record.fid} does not match request fid=${ctx.fid}`,
    );
    return null;
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const ttlRemaining = record.registeredAtUnix + record.ttlSeconds - nowUnix;
  const deadlineRemaining = record.deadlineUnix - nowUnix;
  // Full signer dump so the caller can correlate against on-chain
  // state. Public key + custody address are not secrets; private key
  // is intentionally NOT logged.
  logger.log(
    '[useSubmitCast/hypersnap] using signer:',
    JSON.stringify({
      fid: record.fid,
      pubKey: record.publicKeyHex,
      custody: record.custodyAddress,
      registeredAt: record.registeredAtUnix,
      registeredAtIso: new Date(record.registeredAtUnix * 1000).toISOString(),
      ttlSeconds: record.ttlSeconds,
      ttlRemainingSeconds: ttlRemaining,
      ttlRemainingDays: Math.round(ttlRemaining / 86400),
      deadlineUnix: record.deadlineUnix,
      deadlineRemainingSeconds: deadlineRemaining,
      network: ctx.network,
    }),
  );

  const signer = signerFromRecord(record);
  const { envelope, hash } = await buildSignedMessage(
    {
      type: MessageType.CAST_ADD,
      fid: ctx.fid,
      network: ctx.network,
      body: {
        castAddBody: {
          text: params.text,
          embeds: params.embeds,
          mentions: params.mentions,
          mentionsPositions: params.mentionsPositions,
          parent: resolveParent(params),
          type: params.type,
        },
      },
    },
    signer,
  );
  logger.log(
    '[useSubmitCast/hypersnap] envelope ready, message hash:',
    bytesToHex(hash),
    'envelope bytes:',
    envelope.length,
  );
  const response = await ctx.hypersnap.submitMessage(envelope);
  return { source: 'hypersnap', hash: bytesToHex(hash), response };
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '0x';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

async function submitViaLegacy(
  params: SubmitCastParams,
  ctx: { legacy: LegacyFarcasterClient; token: string },
): Promise<SubmitCastResult> {
  // Legacy `/v2/casts` wants plain URL strings; the protocol-shaped
  // `{ url } | { castId: ... }` embeds aren't accepted there. URL
  // embeds pass through; castId embeds are dropped (the legacy path
  // has no quote-cast affordance — the hypersnap signer path handles
  // them when a signer is available).
  const allEmbeds = params.embeds ?? [];
  const embedsForLegacy: string[] = [];
  let droppedCastIdEmbeds = 0;
  for (const e of allEmbeds) {
    if ('url' in e && typeof e.url === 'string') {
      embedsForLegacy.push(e.url);
    } else if ('castId' in e && params.castIdToUrl) {
      // Legacy `/v2/casts` accepts only string URLs. When a CastId
      // embed was produced by upstream embed translation, route it
      // back to a string by asking the caller's resolver.
      const url = params.castIdToUrl(e.castId);
      if (url) embedsForLegacy.push(url);
      else droppedCastIdEmbeds += 1;
    } else {
      droppedCastIdEmbeds += 1;
    }
  }
  if (droppedCastIdEmbeds > 0) {
    // CastId embeds that couldn't be turned back into a URL string
    // get dropped here. Logged so a "my embed disappeared" bug has a
    // breadcrumb pointing at the cause.
    logger.warn(
      `[useSubmitCast] dropped ${droppedCastIdEmbeds} castId embed(s) on legacy path (no url resolver provided)`,
    );
  }
  const parentHash = params.parent && 'castHashHex' in params.parent ? params.parent.castHashHex : undefined;
  const cast = await ctx.legacy.submitCast(
    {
      text: params.text,
      embeds: embedsForLegacy.length > 0 ? embedsForLegacy : undefined,
      parent: parentHash ? { hash: parentHash } : undefined,
      channelKey: params.channelKey,
    },
    ctx.token,
  );
  // Legacy submitCast wraps `client.farcaster.xyz/v2/casts` whose
  // response shape is `{ result: { cast: { hash, ... } } }` (we accept
  // either shape — top-level or `{ cast }` — to stay tolerant of
  // upstream variants).
  const legacyHash =
    (cast as { hash?: string } | undefined)?.hash ??
    (cast as { cast?: { hash?: string } } | undefined)?.cast?.hash ??
    '';
  return { source: 'legacy', hash: legacyHash, response: cast };
}

export function useSubmitCast(options: UseSubmitCastOptions) {
  const queryClient = useQueryClient();
  return useMutation<SubmitCastResult, Error, SubmitCastParams>({
    ...(options.mutation ?? {}),
    mutationFn: async (params) => {
      const fid = options.fid;
      if (!Number.isFinite(fid) || (fid as number) <= 0) {
        throw new Error('useSubmitCast: fid is required');
      }
      const hypersnap = options.hypersnap ?? getDefaultHypersnapClient();
      const legacy = options.legacy ?? getDefaultLegacyClient();
      const network = options.network ?? FarcasterNetwork.MAINNET;

      // Top-of-mutation log so we can see exactly which call started a
      // submission, with embed/parent context. This pairs with the
      // legacy/hypersnap path logs below to make a single trace.
      logger.log(
        '[useSubmitCast] submit start',
        JSON.stringify({
          textLen: params.text.length,
          embedCount: params.embeds?.length ?? 0,
          embeds: params.embeds,
          parent: params.parent,
          channelKey: params.channelKey,
          hasSigner: Boolean(options.signerStore),
          hasToken: Boolean(options.token),
        }),
      );

      // Try hypersnap if a signer is configured, the FID matches, AND
      // the parent (if any) carries an author FID we can build a castId
      // target with. Hash-only replies (BrowserModal / miniapp compose)
      // route straight to legacy.
      if (options.signerStore && !isParentMissingFid(params)) {
        try {
          const result = await submitViaHypersnap(params, {
            fid: fid as number,
            signerStore: options.signerStore,
            hypersnap,
            network,
          });
          if (result) {
            logger.log('[useSubmitCast] hypersnap path success, hash:', result.hash);
            return result;
          }
          // null = no signer record / fid mismatch. Make this loud
          // so an unintentional legacy-only path is visible instead
          // of silent.
          logger.warn(
            '[useSubmitCast] hypersnap returned null (no signer record or fid mismatch), falling back to legacy',
          );
        } catch (e) {
          logger.warn(
            '[useSubmitCast] hypersnap path threw, falling back to legacy:',
            e instanceof Error ? e.message : String(e),
          );
        }
      } else {
        logger.warn(
          '[useSubmitCast] skipped hypersnap path:',
          !options.signerStore
            ? 'no signer store'
            : 'parent reply missing fid',
        );
      }

      if (!options.token) {
        throw new Error('useSubmitCast: no signer available and no legacy token provided');
      }
      const out = await submitViaLegacy(params, { legacy, token: options.token });
      logger.log('[useSubmitCast] legacy path success, hash:', out.hash);
      return out;
    },
    onSuccess: (data, vars, onMutateResult, ctx) => {
      // Invalidate feed queries so the new cast paints in.
      queryClient.invalidateQueries({ queryKey: farcasterQueryKeys.homeFeed(options.fid) });
      if (vars.channelKey) {
        queryClient.invalidateQueries({ queryKey: farcasterQueryKeys.channelFeed(vars.channelKey) });
      }
      options.mutation?.onSuccess?.(data, vars, onMutateResult, ctx);
    },
  });
}
