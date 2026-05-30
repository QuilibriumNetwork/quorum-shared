import { describe, it, expect } from 'vitest';
import { toggleRolePermission, setRolePermissions } from './roleUtils';
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
