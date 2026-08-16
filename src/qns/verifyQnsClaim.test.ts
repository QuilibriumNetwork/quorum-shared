/**
 * The whole trust decision, reduced to a pure function so it can be tested
 * without a network, a hook or a render.
 *
 * ## Why every ambiguous case must return FALSE
 *
 * The `.q` suffix is the only signal a viewer gets that a name is verified.
 * There is no badge, so the suffix carries the entire claim by itself, and the
 * cost of the two possible errors is wildly asymmetric:
 *
 * - Withholding a `.q` from its real owner is invisible and self-correcting.
 *   They render under their global name until the next lookup succeeds.
 * - Granting a `.q` to somebody who does not own it is an impersonation the
 *   viewer cannot detect by looking, and a screenshot of it is permanent.
 *
 * So no record, no key, a malformed key, a missing address: every one is
 * `false`. "I could not tell" and "no" must produce the same output, which is
 * why this returns a boolean rather than a tri-state.
 *
 * ## The fixture
 *
 * `KEY` is invented — 57 bytes of an arithmetic pattern, nobody's real key.
 * `ADDRESS` is hard-coded rather than computed here, because deriving the
 * expectation with the same function under test would assert nothing.
 *
 * Both values are copied from quorum-mobile's own `verifyQnsClaim.test.ts`,
 * which makes the first case below a CROSS-CLIENT agreement check: mobile
 * derived that address with its implementation, this asserts shared derives
 * the same one. If the two ever diverge, a name verifies on one client and not
 * the other — a bug that would otherwise surface only as "my `.q` shows on my
 * phone but not on desktop".
 */

import { describe, it, expect } from 'vitest';
import { claimedNameBelongsTo } from './verifyQnsClaim';
import { deriveAddress } from './deriveAddress';

/** Invented ed448-shaped public key (57 bytes). Not a real account's. */
const KEY =
  '030a11181f262d343b424950575e656c737a81888f969da4abb2b9c0c7ced5dce3eaf1f8ff060d141b222930373e454c535a61686f767d848b';

/** What quorum-mobile's `deriveAddress(KEY)` produces. See the header. */
const ADDRESS = 'QmRxwsciKWz7fvph4PobmabjChKPZtvkBcE4oALnogXDYW';

/** Somebody else. Shaped like a real address, belongs to nobody. */
const OTHER_ADDRESS = 'QmThemThemThemThemThemThemThemThemThemThemThem';

const record = (over: Record<string, unknown> = {}) => ({
  address: '0xsomethingelse',
  resolveKey: KEY,
  metadata: null,
  ...over,
});

/** Platform-neutral hex -> base64, for the bucket-spelling case below. */
const hexToBase64 = (hex: string): string => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

describe('claimedNameBelongsTo', () => {
  it('agrees with quorum-mobile on what KEY derives to', () => {
    // Guards the cross-client contract directly, so a divergence fails HERE
    // with an obvious message rather than as a confusing false below.
    expect(deriveAddress(KEY)).toBe(ADDRESS);
  });

  it('accepts a name whose resolve key derives to the claimant address', () => {
    expect(claimedNameBelongsTo(record(), ADDRESS)).toBe(true);
  });

  it('rejects a name that resolves to somebody else', () => {
    // The impersonation case: the name is real and registered, it just is not
    // theirs. This is the single most important row in the table.
    expect(claimedNameBelongsTo(record(), OTHER_ADDRESS)).toBe(false);
  });

  it('rejects when the name did not resolve at all', () => {
    // A miss from the batch endpoint arrives as a null slot, not an error.
    // MEASURED against the live API: an unregistered name in a batch comes
    // back as `{"records":[null]}` at HTTP 200.
    expect(claimedNameBelongsTo(null, ADDRESS)).toBe(false);
    expect(claimedNameBelongsTo(undefined, ADDRESS)).toBe(false);
  });

  it('rejects a record carrying no resolve key', () => {
    // Registered and resolvable, but never pointed at a Quorum identity.
    // MEASURED: this is the COMMON case on the live resolver — of eight real
    // names sampled, only one carried a `resolveKey` at all. Verification must
    // treat the rest as unproven rather than as an error.
    expect(claimedNameBelongsTo(record({ resolveKey: undefined }), ADDRESS)).toBe(false);
    expect(claimedNameBelongsTo(record({ resolveKey: null }), ADDRESS)).toBe(false);
  });

  it('rejects a malformed resolve key instead of throwing', () => {
    // Fails closed, and does not take the render path down with it. A throw
    // here would surface as a blank message list, a far worse outcome than a
    // name rendering without its suffix.
    for (const bad of ['', '   ', 'zz', 'not-hex-at-all', '0x', KEY.slice(0, 20)]) {
      expect(claimedNameBelongsTo(record({ resolveKey: bad }), ADDRESS)).toBe(false);
    }
  });

  it('rejects an empty or missing claimant address', () => {
    // Nothing to compare against is not a pass.
    expect(claimedNameBelongsTo(record(), '')).toBe(false);
    expect(claimedNameBelongsTo(record(), '   ')).toBe(false);
    expect(claimedNameBelongsTo(record(), null)).toBe(false);
    expect(claimedNameBelongsTo(record(), undefined)).toBe(false);
  });

  it('tolerates the 0x prefix the live resolver actually returns', () => {
    // MEASURED: `/resolve/batch` returns `resolveKey` 0x-prefixed. This is not
    // a defensive nicety — it is the production shape, and a version of this
    // predicate that only handled the bare form would verify nothing at all.
    expect(claimedNameBelongsTo(record({ resolveKey: `0x${KEY}` }), ADDRESS)).toBe(true);
  });

  it('tolerates an uppercase resolve key', () => {
    expect(claimedNameBelongsTo(record({ resolveKey: KEY.toUpperCase() }), ADDRESS)).toBe(true);
    expect(claimedNameBelongsTo(record({ resolveKey: `0X${KEY}` }), ADDRESS)).toBe(true);
  });

  it('accepts the base64 resolve_key a bucket lookup returns', () => {
    // The two spellings carry the same key in different encodings: `resolveKey`
    // hex from /resolve, `resolve_key` base64 from /bucket. Treating the second
    // as absent would silently unverify every record that came the bucket way,
    // and the symptom would be "my own name has no .q" with nothing logged.
    // Desktop does not read buckets today; mobile does, and shares this code.
    expect(
      claimedNameBelongsTo(
        record({ resolveKey: undefined, resolve_key: hexToBase64(KEY) }),
        ADDRESS,
      ),
    ).toBe(true);
  });

  it('rejects an unparseable base64 resolve_key', () => {
    expect(
      claimedNameBelongsTo(record({ resolveKey: undefined, resolve_key: '!!!!' }), ADDRESS),
    ).toBe(false);
  });

  it('does not compare addresses case-insensitively', () => {
    // base58 is case-SIGNIFICANT: `QmAbc` and `Qmabc` are different addresses.
    // Lowercasing before comparison, the reflex from hex and Ethereum work,
    // would make near-miss addresses verify against each other.
    expect(claimedNameBelongsTo(record(), ADDRESS.toLowerCase())).toBe(false);
    expect(claimedNameBelongsTo(record(), ADDRESS.toUpperCase())).toBe(false);
  });

  it('ignores the address the record itself carries', () => {
    // The record's own `address` field is 0x-hex and is NOT the Qm… identity.
    // More importantly, trusting any address that travelled WITH the claim
    // would let a forger supply both sides of the comparison.
    expect(claimedNameBelongsTo(record({ address: OTHER_ADDRESS }), ADDRESS)).toBe(true);
    expect(claimedNameBelongsTo(record({ address: ADDRESS }), OTHER_ADDRESS)).toBe(false);
  });
});
