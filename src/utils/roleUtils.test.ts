import { describe, it, expect } from 'vitest';
import {
  toggleRolePermission,
  setRolePermissions,
  getRoleColorHex,
  getDefaultRoleColor,
  ROLE_COLORS,
  findRoleConflict,
  isRoleIdentityAvailable,
  getUniqueRoleDefaults,
} from './roleUtils';
import { ICON_COLORS, getIconColorHex } from '../primitives/Icon/pickerVocabulary';
import type { Role } from '../types';

const baseRole: Role = {
  roleId: 'r1',
  displayName: 'Mod',
  roleTag: 'mod',
  color: 'rgb(0,0,0)',
  members: [],
  permissions: [],
  isPublic: true,
};

describe('toggleRolePermission', () => {
  it('adds the permission when absent', () => {
    const result = toggleRolePermission(baseRole, 'message:delete');
    expect(result.permissions).toEqual(['message:delete']);
  });

  it('removes the permission when present', () => {
    const role: Role = { ...baseRole, permissions: ['message:delete', 'message:pin'] };
    const result = toggleRolePermission(role, 'message:delete');
    expect(result.permissions).toEqual(['message:pin']);
  });

  it('does not mutate the input role', () => {
    const role: Role = { ...baseRole, permissions: ['message:delete'] };
    const snapshot = [...role.permissions];
    toggleRolePermission(role, 'message:pin');
    expect(role.permissions).toEqual(snapshot);
  });
});

describe('setRolePermissions', () => {
  it('replaces permissions with the new list', () => {
    const role: Role = { ...baseRole, permissions: ['message:delete'] };
    const result = setRolePermissions(role, ['message:pin', 'user:mute']);
    expect(result.permissions).toEqual(['message:pin', 'user:mute']);
  });

  it('clears permissions when given an empty list', () => {
    const role: Role = { ...baseRole, permissions: ['message:delete'] };
    const result = setRolePermissions(role, []);
    expect(result.permissions).toEqual([]);
  });

  it('does not mutate the input role', () => {
    const role: Role = { ...baseRole, permissions: ['message:delete'] };
    const snapshot = [...role.permissions];
    setRolePermissions(role, ['message:pin']);
    expect(role.permissions).toEqual(snapshot);
  });
});

describe('ROLE_COLORS', () => {
  it('excludes the grey default and exposes only named hues', () => {
    expect(ROLE_COLORS.some((c) => c.value === 'default')).toBe(false);
    expect(ROLE_COLORS.length).toBe(ICON_COLORS.length - 1);
  });

  it('every entry is a valid hex', () => {
    for (const c of ROLE_COLORS) {
      expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('getRoleColorHex', () => {
  it('resolves a named palette token to its hex', () => {
    expect(getRoleColorHex('green')).toBe(getIconColorHex('green'));
    expect(getRoleColorHex('blue')).toBe(getIconColorHex('blue'));
  });

  it('passes through an already-valid hex (legacy mobile roles)', () => {
    expect(getRoleColorHex('#22c55e')).toBe('#22c55e');
    expect(getRoleColorHex('#abc')).toBe('#abc');
  });

  it('maps the legacy desktop CSS-var string to the green hex', () => {
    expect(getRoleColorHex('rgb(var(--success))')).toBe(getIconColorHex('green'));
  });

  it('falls back for unknown / unparseable values', () => {
    const fallback = ROLE_COLORS[0].hex;
    expect(getRoleColorHex('not-a-color')).toBe(fallback);
    expect(getRoleColorHex('rgb(var(--whatever))')).toBe(fallback);
    expect(getRoleColorHex('')).toBe(fallback);
  });

  it('falls back for null / undefined without throwing', () => {
    const fallback = ROLE_COLORS[0].hex;
    expect(getRoleColorHex(undefined)).toBe(fallback);
    expect(getRoleColorHex(null)).toBe(fallback);
  });
});

describe('getDefaultRoleColor', () => {
  it('returns a palette token', () => {
    const token = getDefaultRoleColor('role-abc');
    expect(ROLE_COLORS.some((c) => c.value === token)).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    expect(getDefaultRoleColor('role-abc')).toBe(getDefaultRoleColor('role-abc'));
  });

  it('handles an empty seed without throwing', () => {
    const token = getDefaultRoleColor('');
    expect(ROLE_COLORS.some((c) => c.value === token)).toBe(true);
  });

  it('the chosen token resolves to a valid hex via getRoleColorHex', () => {
    expect(getRoleColorHex(getDefaultRoleColor('seed-xyz'))).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

const rolesFixture: Role[] = [
  { ...baseRole, roleId: 'r1', displayName: 'Mod', roleTag: 'mod' },
  { ...baseRole, roleId: 'r2', displayName: 'Admin', roleTag: 'admin' },
];

describe('findRoleConflict', () => {
  it('returns null when tag and name are both unique', () => {
    expect(findRoleConflict(rolesFixture, { roleTag: 'helper', displayName: 'Helper' })).toBeNull();
  });

  it('detects a duplicate tag (case-insensitive, trimmed)', () => {
    const c = findRoleConflict(rolesFixture, { roleTag: ' MOD ' });
    expect(c?.field).toBe('roleTag');
    expect(c?.role.roleId).toBe('r1');
  });

  it('detects a duplicate name (case-insensitive)', () => {
    const c = findRoleConflict(rolesFixture, { displayName: 'admin' });
    expect(c?.field).toBe('displayName');
    expect(c?.role.roleId).toBe('r2');
  });

  it('reports tag before name when both collide', () => {
    expect(findRoleConflict(rolesFixture, { roleTag: 'mod', displayName: 'Admin' })?.field).toBe('roleTag');
  });

  it('excludes the role being edited (no self-conflict)', () => {
    expect(findRoleConflict(rolesFixture, { roleTag: 'mod', displayName: 'Mod' }, 'r1')).toBeNull();
  });

  it('still flags a collision with a DIFFERENT role when editing', () => {
    expect(findRoleConflict(rolesFixture, { roleTag: 'admin' }, 'r1')?.role.roleId).toBe('r2');
  });
});

describe('isRoleIdentityAvailable', () => {
  it('is the boolean inverse of findRoleConflict', () => {
    expect(isRoleIdentityAvailable(rolesFixture, { roleTag: 'mod' })).toBe(false);
    expect(isRoleIdentityAvailable(rolesFixture, { roleTag: 'helper', displayName: 'Helper' })).toBe(true);
  });
});

describe('getUniqueRoleDefaults', () => {
  it('returns the unsuffixed base when free', () => {
    expect(getUniqueRoleDefaults([])).toEqual({ displayName: 'New Role', roleTag: 'newrole' });
  });

  it('suffixes when the base name/tag is taken', () => {
    const roles: Role[] = [{ ...baseRole, roleId: 'a', displayName: 'New Role', roleTag: 'newrole' }];
    expect(getUniqueRoleDefaults(roles)).toEqual({ displayName: 'New Role 2', roleTag: 'newrole-2' });
  });

  it('skips occupied suffixes (3 in a row)', () => {
    const roles: Role[] = [
      { ...baseRole, roleId: 'a', displayName: 'New Role', roleTag: 'newrole' },
      { ...baseRole, roleId: 'b', displayName: 'New Role 2', roleTag: 'newrole-2' },
    ];
    expect(getUniqueRoleDefaults(roles)).toEqual({ displayName: 'New Role 3', roleTag: 'newrole-3' });
  });

  it('the produced defaults are actually available', () => {
    const roles: Role[] = [{ ...baseRole, roleId: 'a', displayName: 'New Role', roleTag: 'newrole' }];
    const d = getUniqueRoleDefaults(roles);
    expect(isRoleIdentityAvailable(roles, d)).toBe(true);
  });
});
