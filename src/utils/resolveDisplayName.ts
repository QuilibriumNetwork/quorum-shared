import { hasReservedQnsSuffix } from './validation';

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
 * A member's identity, complete by construction.
 *
 * Every field is REQUIRED and explicitly nullable. `null` means "known to be
 * absent"; there is no `undefined`, so a caller that has not looked up a tier
 * cannot silently omit it — omission is a compile error.
 *
 * That is the whole point. The previous shape took three optional fields, and
 * omitting `globalName` did not merely degrade the answer, it INVERTED it: the
 * space ladder compares the per-space name against the global name to tell a
 * deliberate nickname from the name echoed at join, so a missing global name
 * made every roster name look deliberate and buried the QNS name beneath it.
 * That defect was found in ~18 render surfaces across two clients in one day.
 */
export interface MemberIdentity {
  address: string;
  /** Per-space nickname. `null` = none set, or no space context. */
  spaceName: string | null;
  /** QNS primary username, stored BARE (no ".q"). `null` = none elected. */
  qnsName: string | null;
  /** Global display name. `null` = none set. */
  globalName: string | null;
}

/**
 * Which ladder applies.
 *
 * - `space`  — inside a Space: a deliberate nickname outranks the QNS name.
 * - `global` — a DM, or any surface with no Space context: there is no
 *   per-space tier, so the QNS name outranks the display name. `spaceName` is
 *   ignored rather than trusted.
 */
export type IdentityScope = 'space' | 'global';

/**
 * The single name-resolution rule for both clients.
 *
 *   space:  per-space nickname → QNS name → global name → truncated address
 *   global:                      QNS name → global name → truncated address
 *
 * Pure and platform-agnostic. The ".q" suffix is applied by the rendering layer
 * from `isQnsVerified`, never baked into `name`.
 */
export function resolveIdentity(
  identity: MemberIdentity,
  { scope }: { scope: IdentityScope },
): ResolvedName {
  // Every tier goes through `presentUnreserved`, not `present`: a name that
  // would forge the `.q` marker is dropped wherever it is stored.
  const qns = presentUnreserved(identity.qnsName);
  const global = presentUnreserved(identity.globalName);

  if (scope === 'space') {
    const space = presentUnreserved(identity.spaceName);
    // A per-space name EQUAL to the global name is the copy made at join, not a
    // deliberate choice, so it must not outrank the QNS name. The guard runs
    // BEFORE this comparison: compared raw, a forged name differs from the
    // global one and would read as deliberate.
    if (space && space !== global) return { name: space, isQnsVerified: false };
  }

  if (qns) return { name: qns, isQnsVerified: true };
  if (global) return { name: global, isQnsVerified: false };
  return { name: truncate(identity.address), isQnsVerified: false };
}
