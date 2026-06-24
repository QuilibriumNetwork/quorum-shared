/**
 * blockUtils — pure helpers for the personal "block user" feature.
 *
 * Personal block is a VIEWER-SIDE hide: the viewer chooses to hide a user's
 * messages from their own stream, scoped per space. It needs no permission and
 * has no effect for anyone else — distinct from the role-gated moderation mute
 * (which broadcasts a MuteMessage and silences a user for everyone).
 *
 * State lives on `UserConfig.blockedUsers` ({ [spaceId]: address[] }) so it syncs
 * across the viewer's devices via the config blob.
 */

import type { UserConfig } from '../types/user';

/**
 * Is `userAddress` blocked by the viewer in `spaceId`?
 * Pure lookup over `UserConfig.blockedUsers`; safe with undefined input.
 */
export function isUserBlocked(
  userAddress: string,
  spaceId: string,
  blockedUsers?: UserConfig['blockedUsers']
): boolean {
  return blockedUsers?.[spaceId]?.includes(userAddress) ?? false;
}

/** All addresses the viewer has blocked in `spaceId` (empty array if none). */
export function getBlockedUsersForSpace(
  spaceId: string,
  blockedUsers?: UserConfig['blockedUsers']
): string[] {
  return blockedUsers?.[spaceId] ?? [];
}
