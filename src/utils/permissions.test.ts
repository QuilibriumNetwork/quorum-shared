import { describe, it, expect } from 'vitest';
import { hasPermission, getUserPermissions, getUserRoles } from './permissions';
import type { Role, Space } from '../types';

const role = (members: string[], permissions: Role['permissions']): Role => ({
  roleId: 'r1',
  displayName: 'Mod',
  roleTag: 'mod',
  color: 'rgb(0,0,0)',
  members,
  permissions,
  isPublic: true,
});

// hasPermission/getUserPermissions read only space.roles.
const spaceWith = (roles: Role[]): Space => ({ roles } as unknown as Space);

const ALICE = 'addr-alice';
const OWNER = 'addr-owner';

describe('hasPermission', () => {
  it('grants a permission when the user holds a role with it', () => {
    const space = spaceWith([role([ALICE], ['message:delete'])]);
    expect(hasPermission(ALICE, 'message:delete', space)).toBe(true);
  });

  it('denies a permission the user has no role for', () => {
    const space = spaceWith([role([ALICE], ['message:pin'])]);
    expect(hasPermission(ALICE, 'message:delete', space)).toBe(false);
  });

  it('does NOT grant implicit permissions to the space owner (no bypass)', () => {
    // The owner holds no role. Ownership must not short-circuit to true:
    // receivers can't verify ownership, so owners self-assign roles like anyone else.
    const space = spaceWith([role([ALICE], ['message:delete'])]);
    expect(hasPermission(OWNER, 'message:delete', space, true)).toBe(false);
    expect(hasPermission(OWNER, 'mention:everyone', space, true)).toBe(false);
  });

  it('denies when space is undefined', () => {
    expect(hasPermission(ALICE, 'message:delete', undefined)).toBe(false);
  });
});

describe('getUserPermissions', () => {
  it('returns the union of permissions from the user roles', () => {
    const space = spaceWith([
      role([ALICE], ['message:delete']),
      role([ALICE], ['message:pin']),
    ]);
    expect(getUserPermissions(ALICE, space).sort()).toEqual(
      ['message:delete', 'message:pin'].sort()
    );
  });

  it('returns [] for an owner with no role (no owner shortlist)', () => {
    const space = spaceWith([role([ALICE], ['message:delete'])]);
    expect(getUserPermissions(OWNER, space, true)).toEqual([]);
  });
});

describe('getUserRoles', () => {
  it('returns only roles the user is a member of', () => {
    const r1 = role([ALICE], ['message:pin']);
    const r2 = role(['someone-else'], ['message:delete']);
    const space = spaceWith([r1, r2]);
    expect(getUserRoles(ALICE, space)).toEqual([r1]);
  });
});
