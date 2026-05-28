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

export interface SubmitCastParams {
  text: string;
  embeds?: CastEmbed[];
  mentions?: number[];
  mentionsPositions?: number[];
  parent?:
    | { castHashHex: string; fid: number }
    | { url: string };
  /** Optional channel key — mapped to a parent URL by the host since
   *  Farcaster channel URLs are well-known (chains://...). */
  channelKey?: string;
  /** Resolver from channelKey to a parent URL, when channelKey is set. */
  channelKeyToUrl?: (key: string) => string;
  /** Cast type — default CAST (320 bytes). */
  type?: CastType;
}

export type SubmitCastSource = 'hypersnap' | 'legacy';

export interface SubmitCastResult {
  source: SubmitCastSource;
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
      fid: p.parent.fid,
      hash: hexToBytes(p.parent.castHashHex),
    },
  };
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
  if (!record) return null;
  if (record.fid !== ctx.fid) return null;
  const signer = signerFromRecord(record);
  const envelope = await buildSignedMessage(
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
  const response = await ctx.hypersnap.submitMessage(envelope);
  return { source: 'hypersnap', response };
}

async function submitViaLegacy(
  params: SubmitCastParams,
  ctx: { legacy: LegacyFarcasterClient; token: string },
): Promise<SubmitCastResult> {
  const embedsForLegacy = (params.embeds ?? [])
    .filter((e): e is { url: string } => 'url' in e)
    .map((e) => ({ url: e.url }));
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
  return { source: 'legacy', response: cast };
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

      // Try hypersnap if a signer is configured and the FID matches.
      if (options.signerStore) {
        try {
          const result = await submitViaHypersnap(params, {
            fid: fid as number,
            signerStore: options.signerStore,
            hypersnap,
            network,
          });
          if (result) return result;
        } catch {
          // fall through
        }
      }

      if (!options.token) {
        throw new Error('useSubmitCast: no signer available and no legacy token provided');
      }
      return submitViaLegacy(params, { legacy, token: options.token });
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
