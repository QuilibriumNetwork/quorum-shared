/**
 * The personal block filter had no test of any kind — in this repo or in
 * quorum-desktop — until this file (audited 2026-08-23).
 *
 * That mattered more than the size of the code suggests. Block is the one
 * moderation-shaped feature with NO wire component: nothing is broadcast, no
 * permission is checked, no peer is told. So a regression here cannot be
 * caught by any live relay arm, however many are added. The whole feature is
 * these two functions plus one `.filter()` in the consuming client, and a
 * failure is quiet in the worst way: `isUserBlocked` returning false where it
 * should return true means a user you blocked starts appearing again, and the
 * only person who could notice is the one who deliberately chose not to look.
 *
 * Space scoping is the part worth guarding hardest. `blockedUsers` is keyed by
 * spaceId precisely so a block in one space does not follow someone into
 * another, and both directions of that are a real defect: leaking across
 * spaces hides messages the viewer never asked to hide, and failing to apply
 * in the right space is the miss above.
 */
import { describe, it, expect } from 'vitest';
import { isUserBlocked, getBlockedUsersForSpace } from './blockUtils';

const SPACE_A = 'QmSpaceAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SPACE_B = 'QmSpaceBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const BLOCKED = 'QmBlockedUserAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER = 'QmOtherUserBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const blockedUsers = {
  [SPACE_A]: [BLOCKED],
};

describe('isUserBlocked', () => {
  it('is true for a user blocked in that space', () => {
    expect(isUserBlocked(BLOCKED, SPACE_A, blockedUsers)).toBe(true);
  });

  it('is false for a user nobody blocked', () => {
    expect(isUserBlocked(OTHER, SPACE_A, blockedUsers)).toBe(false);
  });

  // The scoping guarantee, in the direction that over-hides.
  it('does not leak a block from one space into another', () => {
    expect(isUserBlocked(BLOCKED, SPACE_B, blockedUsers)).toBe(false);
  });

  it('is false for a space with no blocks at all', () => {
    expect(isUserBlocked(BLOCKED, SPACE_B, {})).toBe(false);
  });

  // A viewer who has never blocked anyone has no `blockedUsers` key on their
  // config at all, which is the common case and must not throw.
  it('is false, not a throw, when the config carries no block state', () => {
    expect(isUserBlocked(BLOCKED, SPACE_A, undefined)).toBe(false);
  });

  // Addresses are compared exactly. A prefix match would block the wrong
  // people, and the addresses here share long prefixes by construction.
  it('does not match on a prefix', () => {
    expect(isUserBlocked(BLOCKED.slice(0, 20), SPACE_A, blockedUsers)).toBe(false);
  });
});

describe('getBlockedUsersForSpace', () => {
  it('returns the blocked addresses for that space', () => {
    expect(getBlockedUsersForSpace(SPACE_A, blockedUsers)).toEqual([BLOCKED]);
  });

  it('returns an empty array for a space with no blocks', () => {
    expect(getBlockedUsersForSpace(SPACE_B, blockedUsers)).toEqual([]);
  });

  // Callers build a Set from this and iterate it; returning undefined would
  // crash the consuming hook rather than degrade to "nobody is blocked".
  it('returns an empty array, never undefined, with no block state', () => {
    expect(getBlockedUsersForSpace(SPACE_A, undefined)).toEqual([]);
  });

  it('keeps several blocked users in one space', () => {
    const many = { [SPACE_A]: [BLOCKED, OTHER] };
    expect(getBlockedUsersForSpace(SPACE_A, many)).toEqual([BLOCKED, OTHER]);
  });
});
