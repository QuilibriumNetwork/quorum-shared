/**
 * useReactToCast — like / recast a cast via hypersnap REACTION_ADD
 * (or REACTION_REMOVE for un-like / un-recast), with legacy fallback.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import {
  buildSignedMessage,
  FarcasterNetwork,
  MessageType,
  ReactionType,
} from '../messageBuilder';
import { hexToBytes } from '../signedKeyRequest';
import { signerFromRecord } from '../signerLifecycle';
import type { SignerStore } from '../signerStore';
import { farcasterQueryKeys } from './queryKeys';

export interface ReactToCastParams {
  /** 0x-prefixed cast hash. */
  castHashHex: string;
  /** Author FID of the target cast. */
  castFid: number;
  reaction: 'like' | 'recast';
  /** When true, REACTION_REMOVE; otherwise REACTION_ADD. */
  remove?: boolean;
}

export interface UseReactToCastOptions {
  fid: number | undefined;
  token?: string;
  signerStore?: SignerStore;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  network?: FarcasterNetwork;
}

export interface ReactToCastResult {
  source: 'hypersnap' | 'legacy';
  response: unknown;
}

function reactionType(r: 'like' | 'recast'): ReactionType {
  return r === 'like' ? ReactionType.LIKE : ReactionType.RECAST;
}

export function useReactToCast(options: UseReactToCastOptions) {
  const queryClient = useQueryClient();
  return useMutation<ReactToCastResult, Error, ReactToCastParams>({
    mutationFn: async (params) => {
      const fid = options.fid;
      if (!Number.isFinite(fid) || (fid as number) <= 0) {
        throw new Error('useReactToCast: fid is required');
      }
      const hypersnap = options.hypersnap ?? getDefaultHypersnapClient();
      const legacy = options.legacy ?? getDefaultLegacyClient();
      const network = options.network ?? FarcasterNetwork.MAINNET;

      if (options.signerStore) {
        try {
          const record = await options.signerStore.get();
          if (record && record.fid === fid) {
            const signer = signerFromRecord(record);
            const { envelope } = await buildSignedMessage(
              {
                type: params.remove ? MessageType.REACTION_REMOVE : MessageType.REACTION_ADD,
                fid: fid as number,
                network,
                body: {
                  reactionBody: {
                    type: reactionType(params.reaction),
                    target: {
                      castId: { fid: params.castFid, hash: hexToBytes(params.castHashHex) },
                    },
                  },
                },
              },
              signer,
            );
            const response = await hypersnap.submitMessage(envelope);
            return { source: 'hypersnap', response };
          }
        } catch {
          // fall through
        }
      }

      if (!options.token) {
        throw new Error('useReactToCast: no signer available and no legacy token provided');
      }
      // Legacy supports only `like` writes for now.
      if (params.reaction !== 'like') {
        throw new Error('useReactToCast: recast via legacy is not supported');
      }
      if (params.remove) {
        await legacy.unlikeCast(params.castHashHex, options.token);
      } else {
        await legacy.likeCast(params.castHashHex, options.token);
      }
      return { source: 'legacy', response: null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: farcasterQueryKeys.homeFeed(options.fid) });
    },
  });
}
