import type { SpaceMember, PublicProfile } from '../types/user';

/**
 * The subset of member/profile fields the name-resolution rule reads.
 * Accepts any object carrying these (SpaceMember, PublicProfile, or a partial).
 */
export type Resolvable = Partial<
  Pick<SpaceMember & PublicProfile, 'display_name' | 'name' | 'primary_username'>
> & {
  address: string;
};

export interface ResolvedName {
  /** The readable name to display. Never empty. */
  name: string;
  /** True only when `name` is the user's QNS username (render with `.q`). */
  isQnsVerified: boolean;
}

const present = (s?: string | null): string | null => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};

const truncate = (addr: string): string =>
  addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

/**
 * The single name-resolution rule for the whole app. Most-specific wins:
 *
 *   per-space override → QNS primary_username → global display name → name → address
 *
 * Pure and platform-agnostic. The `.q` suffix and accent styling are applied by
 * the rendering layer based on `isQnsVerified`, not baked into `name`. This
 * function is the single source of truth so the four surfaces (profile card,
 * DM header, mention pill, mention autocomplete) can never drift apart.
 */
export function resolveDisplayName(
  member: Resolvable,
  opts: { spaceOverrideName?: string | null } = {}
): ResolvedName {
  const override = present(opts.spaceOverrideName);
  if (override) return { name: override, isQnsVerified: false };

  const qns = present(member.primary_username);
  if (qns) return { name: qns, isQnsVerified: true };

  const display = present(member.display_name);
  if (display) return { name: display, isQnsVerified: false };

  const name = present(member.name);
  if (name) return { name, isQnsVerified: false };

  return { name: truncate(member.address), isQnsVerified: false };
}
