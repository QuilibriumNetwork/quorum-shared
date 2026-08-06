import type { SpaceMember, PublicProfile } from '../types/user';
import { hasReservedQnsSuffix } from './validation';

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

/**
 * A stored name that would forge the verified-QNS marker is not a name.
 *
 * `.q` is a trust marker: it is appended at render ONLY for a name that came
 * from the QNS tier, and that suffix is the ONLY signal a viewer gets —
 * `isQnsVerified` reaches the UI on both clients and neither renders it. So a
 * display name of `alice.q` is byte-identical on screen to a name somebody paid
 * to register and elected primary.
 *
 * Display names are forbidden from ending in `.q` (`getReservedNameType`), but
 * that validator runs on LOCAL TEXT INPUT and nowhere on receive. A modified
 * client can therefore broadcast `alice.q` as an ordinary display name and every
 * honest recipient renders it as verified. The signature on that broadcast
 * proves who sent it, not that its contents are legal.
 *
 * Enforcing it HERE — inside the one function both clients already call for
 * every name they render — is what makes it un-bypassable:
 *
 * - it covers rows already stored with a forged name, because it runs at read
 * - it cannot be missed by a write path added later, or by one a fix overlooked
 * - it cannot drift between the two clients, which is what happened when the
 *   rule lived in mobile's adapter and desktop had no copy of it at all
 *
 * **Dropping rather than stripping.** A name that tried to forge the marker has
 * told us what it is; falling through to the next tier is the fail-closed
 * choice. Stripping the suffix would render it as somebody else's bare name,
 * which is a different impersonation rather than a fix.
 *
 * Applied to `primary_username` too, for a different reason: a QNS name is
 * stored BARE and the suffix is presentation, so one arriving with `.q` already
 * on it is malformed however it got there and would otherwise render `alice.q.q`.
 *
 * `hasReservedQnsSuffix` rather than a local `endsWith`, so this and the input
 * validator can never disagree — it also folds confusable Unicode dots, which a
 * hand-rolled check would miss.
 */
const presentUnreserved = (s?: string | null): string | null => {
  const t = present(s);
  if (!t) return null;
  return hasReservedQnsSuffix(t) ? null : t;
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
  // Every tier goes through `presentUnreserved`, not `present`: a name that
  // would forge the `.q` marker is dropped wherever it is stored. See its
  // docstring for why this is enforced at read, in shared, rather than at each
  // client's write paths.
  const override = presentUnreserved(opts.spaceOverrideName);
  if (override) return { name: override, isQnsVerified: false };

  const qns = presentUnreserved(member.primary_username);
  if (qns) return { name: qns, isQnsVerified: true };

  const display = presentUnreserved(member.display_name);
  if (display) return { name: display, isQnsVerified: false };

  const name = presentUnreserved(member.name);
  if (name) return { name, isQnsVerified: false };

  return { name: truncate(member.address), isQnsVerified: false };
}
