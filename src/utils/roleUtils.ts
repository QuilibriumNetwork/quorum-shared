import type { Permission, Role } from '../types';
import { ICON_COLORS, getIconColorHex, type IconColor } from '../primitives/Icon/pickerVocabulary';

/**
 * Role color palette + resolver.
 *
 * `Role.color` is part of the synced space manifest, so it MUST be a portable,
 * platform-independent value — a named palette token (e.g. 'blue'), resolved to
 * a hex at render time. (React Native cannot resolve CSS variables, so a web
 * value like 'rgb(var(--success))' renders as an invalid color there.)
 *
 * Roles draw from the SAME named-color vocabulary as the icon/folder picker
 * (ICON_COLORS) so the app has one color story. We exclude 'default' (grey) —
 * a role wants a real hue. `getRoleColorHex` tolerates legacy values already in
 * the wild (raw hex from old mobile clients, the legacy desktop CSS-var string)
 * so historical roles keep rendering.
 */

/** Role-assignable palette: every named hue except the grey `default`. */
export const ROLE_COLORS: { value: IconColor; hex: string }[] = ICON_COLORS
  .filter((c) => c.value !== 'default')
  .map((c) => ({ value: c.value, hex: c.hex }));

/** Fallback when a role color can't be resolved (first palette hue). */
const ROLE_COLOR_FALLBACK = ROLE_COLORS[0]?.hex ?? '#3b82f6';

/**
 * The single legacy CSS-variable string desktop historically wrote into
 * `Role.color` (the hardcoded default before the palette existed). It resolves
 * in a browser but not in React Native — map it to the green hue so old roles
 * stay green everywhere instead of rendering invisibly.
 */
const LEGACY_CSS_VAR_TO_TOKEN: Record<string, IconColor> = {
  'rgb(var(--success))': 'green',
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Resolve a stored `Role.color` to a render-safe hex, tolerating every format
 * seen in the wild:
 *  - a named palette token ('blue', 'green', …)  → its hex
 *  - an already-valid hex ('#22c55e', mobile legacy) → passthrough
 *  - the legacy desktop CSS-var ('rgb(var(--success))') → the green hex
 *  - anything else (empty / unparseable)         → the palette fallback
 *
 * Never throws. Safe to call on any string from a manifest.
 */
export function getRoleColorHex(color: string | undefined | null): string {
  if (!color) return ROLE_COLOR_FALLBACK;

  // Named palette token (the canonical, going-forward format).
  const token = ROLE_COLORS.find((c) => c.value === color);
  if (token) return token.hex;

  // Already a portable hex (old mobile roles stored raw hex).
  if (HEX_RE.test(color)) return color;

  // Known legacy CSS-variable string from old desktop roles.
  const legacyToken = LEGACY_CSS_VAR_TO_TOKEN[color];
  if (legacyToken) return getIconColorHex(legacyToken);

  // Unknown / unparseable — don't render an invalid color.
  return ROLE_COLOR_FALLBACK;
}

/**
 * Pick a stable, distinct default color token for a new role from a seed
 * (use the roleId). Deterministic so the same role resolves to the same color
 * on every device without storing a random value. DJB2 hash, mirroring
 * getColorFromDisplayName in avatar.ts.
 */
export function getDefaultRoleColor(seed: string): IconColor {
  if (!seed || ROLE_COLORS.length === 0) {
    return ROLE_COLORS[0]?.value ?? 'blue';
  }
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) + seed.charCodeAt(i); // hash * 33 + c
  }
  return ROLE_COLORS[(hash >>> 0) % ROLE_COLORS.length].value;
}

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

// ============================================
// ROLE TAG / NAME UNIQUENESS
// ============================================
//
// A role has both a `roleTag` (used to @mention the role) and a `displayName`.
// Neither should collide with another role in the same space. Matching is
// case-insensitive and trims surrounding whitespace, so "Mod" and " mod " are
// considered the same. Both clients should enforce this identically.

/** Which field of a candidate role collides with an existing role. */
export type RoleConflictField = 'roleTag' | 'displayName';

const normalizeRoleValue = (value: string): string => value.trim().toLowerCase();

/**
 * Find the first existing role whose tag or name collides with the candidate.
 * Returns `null` if the candidate is unique.
 *
 * @param roles       all roles currently in the space
 * @param candidate   the tag/name being created or edited
 * @param excludeRoleId  when editing, the role being edited (so it doesn't
 *                       conflict with itself)
 */
export function findRoleConflict(
  roles: Role[],
  candidate: { roleTag?: string; displayName?: string },
  excludeRoleId?: string,
): { field: RoleConflictField; role: Role } | null {
  const tag = candidate.roleTag != null ? normalizeRoleValue(candidate.roleTag) : undefined;
  const name = candidate.displayName != null ? normalizeRoleValue(candidate.displayName) : undefined;

  for (const role of roles) {
    if (role.roleId === excludeRoleId) continue;
    if (tag && normalizeRoleValue(role.roleTag) === tag) {
      return { field: 'roleTag', role };
    }
    if (name && normalizeRoleValue(role.displayName) === name) {
      return { field: 'displayName', role };
    }
  }
  return null;
}

/** True if the candidate tag/name does not collide with any existing role. */
export function isRoleIdentityAvailable(
  roles: Role[],
  candidate: { roleTag?: string; displayName?: string },
  excludeRoleId?: string,
): boolean {
  return findRoleConflict(roles, candidate, excludeRoleId) === null;
}

/**
 * Produce a unique default displayName + roleTag for a NEW role, suffixing a
 * number when the base is already taken: "New Role", "New Role 2", … and
 * "newrole", "newrole-2", …. Avoids creating duplicate-named roles when the
 * user repeatedly hits an "add role" button (there is no per-role save gate).
 */
export function getUniqueRoleDefaults(
  roles: Role[],
  baseName = 'New Role',
  baseTag = 'newrole',
): { displayName: string; roleTag: string } {
  let n = 1;
  // n === 1 is the unsuffixed base; 2+ append the number.
  // Loop until both the name and the tag are free at the same suffix.
  // (Bounded by roles.length + 1 in practice; the guard caps pathological input.)
  while (n < roles.length + 2) {
    const displayName = n === 1 ? baseName : `${baseName} ${n}`;
    const roleTag = n === 1 ? baseTag : `${baseTag}-${n}`;
    if (isRoleIdentityAvailable(roles, { roleTag, displayName })) {
      return { displayName, roleTag };
    }
    n++;
  }
  // Fallback (shouldn't happen): force-unique with the count.
  const suffix = roles.length + 1;
  return { displayName: `${baseName} ${suffix}`, roleTag: `${baseTag}-${suffix}` };
}
