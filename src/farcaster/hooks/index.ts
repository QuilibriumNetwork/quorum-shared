/**
 * Farcaster hook exports.
 */

export { farcasterQueryKeys } from './queryKeys';

export {
  useFarcasterUser,
  fetchFarcasterUser,
  type UseFarcasterUserOptions,
} from './useFarcasterUser';

export {
  useFarcasterUserByUsername,
  fetchFarcasterUserByUsername,
  type UseFarcasterUserByUsernameOptions,
} from './useFarcasterUserByUsername';

export {
  useFarcasterUsersBulk,
  fetchFarcasterUsersBulk,
  type UseFarcasterUsersBulkOptions,
} from './useFarcasterUsersBulk';

export {
  useFarcasterCast,
  fetchFarcasterCast,
  type UseFarcasterCastOptions,
} from './useFarcasterCast';

export {
  useFarcasterCastByUrl,
  fetchFarcasterCastByUrl,
  type UseFarcasterCastByUrlOptions,
} from './useFarcasterCastByUrl';

export {
  useFarcasterChannelByParentUrl,
  fetchChannelByParentUrl,
  type FarcasterChannelInfo,
  type UseFarcasterChannelByParentUrlOptions,
} from './useFarcasterChannelByParentUrl';

export {
  useHomeFeed,
  flattenHomeFeed,
  type HomeFeedPage,
  type HomeFeedCursor,
  type UseHomeFeedOptions,
} from './useHomeFeed';

export {
  useChannelFeed,
  flattenChannelFeed,
  type ChannelFeedPage,
  type ChannelFeedCursor,
  type UseChannelFeedOptions,
} from './useChannelFeed';

export {
  useEnrichEmbeds,
  type EmbedEnrichmentResolver,
  type UseEnrichEmbedsOptions,
} from './useEnrichEmbeds';

export {
  useViewerOverlay,
  type ViewerOverlayEntry,
  type ViewerOverlayResolver,
  type UseViewerOverlayOptions,
} from './useViewerOverlay';

// Write hooks (signer-gated, with legacy fallback).
export {
  useSubmitCast,
  type SubmitCastParams,
  type SubmitCastResult,
  type SubmitCastSource,
  type UseSubmitCastOptions,
} from './useSubmitCast';

export {
  useReactToCast,
  type ReactToCastParams,
  type ReactToCastResult,
  type UseReactToCastOptions,
} from './useReactToCast';

export {
  useUpdateProfile,
  type UpdateProfileParams,
  type UpdateProfileResult,
  type UseUpdateProfileOptions,
} from './useUpdateProfile';
