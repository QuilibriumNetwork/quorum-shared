/**
 * useUpdateProfile — update profile fields via USER_DATA_ADD messages over
 * hypersnap (one message per changed field), with PATCH /v2/me fallback.
 *
 * PFP image upload (Cloudflare) still uses the legacy endpoint since
 * hypersnap doesn't host images. The flow is:
 *   1. If `pfpImageUri` is supplied, upload via legacy first to get a
 *      CDN URL. Failure here aborts (nothing to fall back to).
 *   2. For each remaining field (including the new pfp URL), submit one
 *      USER_DATA_ADD message. Per-field hypersnap failure adds the field
 *      to a `legacyTail` set.
 *   3. If `legacyTail` is non-empty, PATCH /v2/me with the union of those
 *      fields in a single call.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDefaultHypersnapClient, type HypersnapClient } from '../hypersnapClient';
import { getDefaultLegacyClient, type LegacyFarcasterClient } from '../legacyClient';
import {
  buildSignedMessage,
  FarcasterNetwork,
  MessageType,
  UserDataType,
} from '../messageBuilder';
import { signerFromRecord } from '../signerLifecycle';
import type { SignerStore } from '../signerStore';
import { farcasterQueryKeys } from './queryKeys';

export interface UpdateProfileParams {
  displayName?: string;
  bio?: string;
  location?: string;
  url?: string;
  /** Local file URI or data URI for a new profile picture. Uploaded via
   *  the legacy CDN, then submitted as USER_DATA_ADD PFP value (the CDN URL). */
  pfpImageUri?: string;
}

export interface UseUpdateProfileOptions {
  fid: number | undefined;
  /** Required when image upload is requested OR for the legacy fallback. */
  token?: string;
  /** When supplied, the host implements the actual multipart upload —
   *  takes the Cloudflare URL and the local image URI, returns the
   *  CDN-resolved URL on success. Without this the pfp field has to fall
   *  back to legacy (which knows how to do the upload). */
  uploadPfpImage?: (uploadUrl: string, imageUri: string) => Promise<string>;
  signerStore?: SignerStore;
  hypersnap?: HypersnapClient;
  legacy?: LegacyFarcasterClient;
  network?: FarcasterNetwork;
}

export interface UpdateProfileResult {
  hypersnapFields: { field: keyof UpdateProfileParams; userDataType: UserDataType }[];
  legacyFields: (keyof UpdateProfileParams)[];
}

const FIELD_TO_USER_DATA: Record<string, UserDataType> = {
  displayName: UserDataType.DISPLAY,
  bio: UserDataType.BIO,
  location: UserDataType.LOCATION,
  url: UserDataType.URL,
  pfp: UserDataType.PFP,
};

export function useUpdateProfile(options: UseUpdateProfileOptions) {
  const queryClient = useQueryClient();
  return useMutation<UpdateProfileResult, Error, UpdateProfileParams>({
    mutationFn: async (params) => {
      const fid = options.fid;
      if (!Number.isFinite(fid) || (fid as number) <= 0) {
        throw new Error('useUpdateProfile: fid is required');
      }
      const hypersnap = options.hypersnap ?? getDefaultHypersnapClient();
      const legacy = options.legacy ?? getDefaultLegacyClient();
      const network = options.network ?? FarcasterNetwork.MAINNET;

      // ---- Step 1: pfp upload (always legacy) ------------------------------
      let resolvedPfpUrl: string | undefined;
      if (params.pfpImageUri) {
        if (!options.token) {
          throw new Error('useUpdateProfile: pfp upload requires a legacy token');
        }
        if (!options.uploadPfpImage) {
          // No uploader — defer the entire pfp change to the legacy PATCH.
          // The legacy PATCH path handles its own multipart in mobile.
        } else {
          const { url } = await legacy.generateImageUploadUrl(options.token);
          resolvedPfpUrl = await options.uploadPfpImage(url, params.pfpImageUri);
        }
      }

      // ---- Step 2: per-field USER_DATA_ADD via hypersnap -------------------
      const record = options.signerStore ? await options.signerStore.get() : null;
      const signerRecord = record && record.fid === fid ? record : null;
      const signer = signerRecord ? signerFromRecord(signerRecord) : null;

      const candidates: { field: keyof UpdateProfileParams; userDataType: UserDataType; value: string }[] = [];
      if (params.displayName !== undefined) {
        candidates.push({ field: 'displayName', userDataType: UserDataType.DISPLAY, value: params.displayName });
      }
      if (params.bio !== undefined) {
        candidates.push({ field: 'bio', userDataType: UserDataType.BIO, value: params.bio });
      }
      if (params.location !== undefined) {
        candidates.push({ field: 'location', userDataType: UserDataType.LOCATION, value: params.location });
      }
      if (params.url !== undefined) {
        candidates.push({ field: 'url', userDataType: UserDataType.URL, value: params.url });
      }
      if (resolvedPfpUrl !== undefined) {
        candidates.push({ field: 'pfpImageUri', userDataType: UserDataType.PFP, value: resolvedPfpUrl });
      }

      const hypersnapFields: { field: keyof UpdateProfileParams; userDataType: UserDataType }[] = [];
      const legacyTail = new Set<keyof UpdateProfileParams>();

      // pfp that we couldn't upload locally still needs to ride along on
      // the legacy PATCH path (which knows how to multipart-upload itself).
      if (params.pfpImageUri && resolvedPfpUrl === undefined) {
        legacyTail.add('pfpImageUri');
      }

      if (signer) {
        for (const c of candidates) {
          try {
            const envelope = await buildSignedMessage(
              {
                type: MessageType.USER_DATA_ADD,
                fid: fid as number,
                network,
                body: { userDataBody: { type: c.userDataType, value: c.value } },
              },
              signer,
            );
            await hypersnap.submitMessage(envelope);
            hypersnapFields.push({ field: c.field, userDataType: c.userDataType });
          } catch {
            legacyTail.add(c.field);
          }
        }
      } else {
        for (const c of candidates) legacyTail.add(c.field);
      }

      // ---- Step 3: legacy PATCH for everything that didn't land -----------
      if (legacyTail.size > 0) {
        if (!options.token) {
          throw new Error('useUpdateProfile: hypersnap submission failed and no legacy token to fall back to');
        }
        const patch: Parameters<LegacyFarcasterClient['updateProfile']>[0] = {};
        if (legacyTail.has('displayName')) patch.displayName = params.displayName;
        if (legacyTail.has('bio')) patch.bio = params.bio;
        if (legacyTail.has('location')) patch.location = params.location;
        if (legacyTail.has('url')) patch.url = params.url;
        if (legacyTail.has('pfpImageUri')) patch.pfp = resolvedPfpUrl ?? params.pfpImageUri;
        await legacy.updateProfile(patch, options.token);
      }

      return { hypersnapFields, legacyFields: Array.from(legacyTail) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: farcasterQueryKeys.user(options.fid) });
    },
  });
}

// Exported for tests / call-site convenience.
export { FIELD_TO_USER_DATA };
