import type { Permission, Role, Space } from '../types';

/**
 * Utility functions for checking user permissions in spaces
 */

/**
 * Check if a user has a specific permission in a space
 * @param userAddress - The address of the user to check
 * @param permission - The permission to check for
 * @param space - The space object containing roles
 * @param _isSpaceOwner - Deprecated/ignored. Ownership grants NO implicit
 *   permissions: clients can't verify who the owner is (no ownerAddress on the
 *   wire, by design), so owners must self-assign a role like anyone else. The
 *   only owner-only action is kick, enforced via the owner's Ed448 key, not here.
 * @returns boolean - true if user has the permission
 */
export function hasPermission(
  userAddress: string,
  permission: Permission,
  space: Space | undefined,
  _isSpaceOwner: boolean = false
): boolean {
  // If no space data available, deny permission
  if (!space || !space.roles) {
    return false;
  }

  // Check if user has any role with the required permission
  return space.roles.some(
    (role: Role) =>
      role.members.includes(userAddress) &&
      role.permissions.includes(permission)
  );
}

/**
 * Get all permissions a user has in a space
 * @param userAddress - The address of the user
 * @param space - The space object containing roles
 * @param _isSpaceOwner - Deprecated/ignored (see hasPermission). Ownership grants
 *   no implicit permissions; owners must self-assign roles. Kick is separate.
 * @returns Permission[] - array of permissions the user has
 */
export function getUserPermissions(
  userAddress: string,
  space: Space | undefined,
  _isSpaceOwner: boolean = false
): Permission[] {
  if (!space || !space.roles) {
    return [];
  }

  // Collect all unique permissions from user's roles
  const permissions = new Set<Permission>();

  space.roles.forEach((role: Role) => {
    if (role.members.includes(userAddress)) {
      role.permissions.forEach((permission: Permission) => {
        permissions.add(permission);
      });
    }
  });

  return Array.from(permissions);
}

/**
 * Get all roles a user has in a space
 * @param userAddress - The address of the user
 * @param space - The space object containing roles
 * @returns Role[] - array of roles the user has
 */
export function getUserRoles(
  userAddress: string,
  space: Space | undefined
): Role[] {
  if (!space || !space.roles) {
    return [];
  }

  return space.roles.filter((role: Role) => role.members.includes(userAddress));
}
