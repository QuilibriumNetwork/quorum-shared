import type { Permission, Role } from '../types';

/**
 * Add or remove a permission from a role.
 * If the role already has the permission, removes it.
 * If not, adds it.
 * Returns a new Role; does not mutate the input.
 */
export function toggleRolePermission(role: Role, permission: Permission): Role {
  return {
    ...role,
    permissions: role.permissions.includes(permission)
      ? role.permissions.filter((p) => p !== permission)
      : [...role.permissions, permission],
  };
}

/**
 * Replace a role's permissions with a new list.
 * Returns a new Role; does not mutate the input.
 */
export function setRolePermissions(role: Role, permissions: Permission[]): Role {
  return { ...role, permissions };
}
