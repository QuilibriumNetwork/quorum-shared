/**
 * Does a claimed `.q` name actually belong to the account claiming it?
 *
 * A `primary_username` is a SELF-REPORTED field. It arrives inside someone
 * else's profile or broadcast, signed by them, and a signature proves who sent
 * a payload rather than that its contents are true. Nothing upstream checks it:
 * the server intends to and its check is broken, and the space/DM broadcast
 * removes the server from the loop entirely. So the receiving client is the
 * only party in a position to ask whether the claim holds.
 *
 * The check itself is one comparison:
 *
 *     claimed name ──resolve──▶ resolveKey (ed448 public key)
 *                                    │  deriveAddress()
 *                                    ▼
 *                          derived Qm address  ===  the address it arrived with?
 *
 * ## Pure, synchronous, and boolean on purpose
 *
 * No network here. Callers resolve names upstream, in one batched request (see
 * `resolveNamesBatch`), and hand the record in. That keeps this testable
 * without mocking anything, and keeps the resolver unaware that verification
 * exists.
 *
 * Boolean rather than tri-state, deliberately. "Verified", "not verified" and
 * "could not tell" collapse to two outcomes, because the moment a caller can
 * distinguish "could not tell" from "no", somebody renders it optimistically —
 * and an optimistic `.q`, even for the instant before a lookup returns, is the
 * entire attack. A screenshot does not expire.
 *
 * ## Every ambiguous case is FALSE, because the errors are not symmetric
 *
 * Withholding a `.q` from its rightful owner is invisible and self-correcting:
 * they render under their global name until a lookup succeeds. Granting one to
 * an impersonator is undetectable by the viewer and permanent. So no record, no
 * key, a malformed key, a missing address — all false.
 *
 * ## ⚠️ quorum-mobile still has its own copy, and they have already diverged
 *
 * `quorum-mobile/utils/verifyQnsClaim.ts` shipped first and is where this was
 * derived from. This is the intended long-term home (both clients need it, and
 * `deriveAddress`/`resolveName` already live here), so **mobile's copy should be
 * retired in favour of this one** — until it is, two implementations of the one
 * check the whole feature rests on have to be changed together by hand.
 *
 * The known divergence, so whoever does that migration does not lose it: this
 * version validates the key as even-length hex BEFORE deriving, because shared's
 * `deriveAddress` coerces unparseable hex to zero bytes instead of throwing.
 * Mobile's `deriveAddress` is a different implementation and throws, so mobile's
 * copy relies on the `catch`. Dropping the guard while adopting this file would
 * make malformed keys fail closed by luck rather than by construction.
 */

import { base64ToBytes, bytesToHex } from '../utils/encoding';
import { deriveAddress } from './deriveAddress';

/**
 * The parts of a QNS name record this needs.
 *
 * Structural rather than importing `QnsNameRecord`, so a caller can pass a row
 * from anywhere that carries the key — including mobile's fuller `NameRecord`
 * and rows read back out of local storage — without the record having to be
 * the exact resolver type.
 */
export interface ResolvedNameKey {
  /** Hex-encoded ed448 public key. What `/resolve` and `/resolve/batch` return. */
  resolveKey?: string | null;
  /** Base64-encoded, same key. What `/bucket/{tag}` returns instead. */
  resolve_key?: string | null;
}

/** Hex, after `0x`/`0X` is stripped: an even number of hex digits, at least one. */
const HEX_ONLY = /^[0-9a-fA-F]+$/;

/**
 * Read whichever spelling of the key the record carries, as bare hex.
 *
 * Both spellings are handled because the two endpoints disagree about encoding:
 * `/resolve` and `/resolve/batch` return hex under `resolveKey` (MEASURED:
 * `0x`-prefixed), while `/bucket/{tag}` returns base64 under `resolve_key`.
 * Treating the bucket spelling as absent would silently unverify every record
 * that arrived that way, and the symptom would be "my name lost its `.q`" with
 * nothing logged anywhere — the worst shape of bug this feature can produce,
 * because it is indistinguishable from the feature simply not working.
 *
 * Returns `undefined` for anything it cannot read as hex. Validating here, up
 * front, rather than letting `deriveAddress` swallow bad input: that function
 * coerces unparseable hex to zero bytes instead of throwing, so a malformed key
 * would still derive *some* address. That address never matches a real
 * claimant, so the outcome is the same — but it would be false by luck rather
 * than by construction, and luck is not a property you want carrying a security
 * check.
 */
function readKeyAsHex(record: ResolvedNameKey | null | undefined): string | undefined {
  // `??`, so a PRESENT-but-unreadable hex key still falls through to the base64
  // spelling. Testing `if (hex)` instead would strand a record carrying a
  // garbage `resolveKey` alongside a valid `resolve_key`, rejecting a claim
  // whose key was right there.
  return fromHexSpelling(record?.resolveKey) ?? fromBase64Spelling(record?.resolve_key);
}

/**
 * Trim `raw` if it is a string, otherwise treat it as absent.
 *
 * The record is whatever the resolver returned, parsed from JSON and CAST to a
 * type — nothing validates it at runtime. So a field typed `string | null` can
 * arrive as a number, an object or a boolean, and calling `.trim()` on one
 * throws a TypeError. That throw would escape this module, escape the `useMemo`
 * that calls it, and take down every surface under the identity provider — the
 * blank message list this file's docstring promises never to cause. An
 * unreadable key is "no key", which is already the fail-closed answer.
 */
const asTrimmedString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

/** Hex, as `/resolve` and `/resolve/batch` return it (MEASURED: `0x`-prefixed). */
function fromHexSpelling(raw: unknown): string | undefined {
  const hex = asTrimmedString(raw).replace(/^0x/i, '');
  if (!hex) return undefined;
  return hex.length % 2 === 0 && HEX_ONLY.test(hex) ? hex : undefined;
}

/** Base64, as `/bucket/{tag}` returns it. */
function fromBase64Spelling(raw: unknown): string | undefined {
  const b64 = asTrimmedString(raw);
  if (!b64) return undefined;
  try {
    const decoded = bytesToHex(base64ToBytes(b64));
    return decoded.length ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True only when `record` proves the name resolves to `claimantAddress`.
 *
 * `claimantAddress` is the address the claim arrived attached to — the roster
 * row's address, the message sender's address. It must NEVER be a value taken
 * from the same payload as the claim itself, which would let a forger supply
 * both sides of the comparison. Note this deliberately ignores the record's own
 * `address` field for that reason (and because it is 0x-hex, a different
 * address space from the Qm… identity).
 */
export function claimedNameBelongsTo(
  record: ResolvedNameKey | null | undefined,
  claimantAddress: string | null | undefined,
): boolean {
  const address = (claimantAddress ?? '').trim();
  if (!address) return false;

  const keyHex = readKeyAsHex(record);
  if (!keyHex) return false;

  let derived: string;
  try {
    derived = deriveAddress(keyHex);
  } catch {
    // Fail closed rather than propagate. This runs on the path that produces a
    // message list, and a throw here renders as a blank screen — a far worse
    // outcome than a name missing its suffix.
    return false;
  }

  // Exact comparison. base58 is case-SIGNIFICANT, so the reflex from hex and
  // Ethereum work — lowercase both sides before comparing — would make
  // near-miss addresses verify against each other.
  return derived === address;
}
