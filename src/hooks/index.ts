/**
 * Shared React Query hooks
 */

// Query keys
export { queryKeys } from './keys';
export type {
  SpacesKey,
  SpaceDetailKey,
  ChannelsKey,
  MessagesInfiniteKey,
} from './keys';

// Space hooks
export { useSpaces, useSpace, useSpaceMembers } from './useSpaces';
export type { UseSpacesOptions, UseSpaceOptions } from './useSpaces';

// Channel hooks
export { useChannels, flattenChannels, findChannel } from './useChannels';
export type { UseChannelsOptions } from './useChannels';

// Message hooks
export {
  useMessages,
  flattenMessages,
  useInvalidateMessages,
} from './useMessages';
export type { UseMessagesOptions } from './useMessages';

// Mutations (to be added)
export * from './mutations';
