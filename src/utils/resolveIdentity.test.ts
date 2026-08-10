/**
 * The name ladder, as a truth table.
 *
 * Every tier must pass through the forged-suffix guard: `.q` is the only signal
 * a viewer gets that a name is verified, so a stored name ending in `.q` is
 * dropped rather than rendered. See `presentUnreserved` in resolveDisplayName.ts.
 */
import { describe, it, expect } from 'vitest';
import { resolveIdentity, type MemberIdentity } from './resolveDisplayName';

const ADDR = 'QmPeerAEgVKpYZKYuFu2J49zHXnA8vZtEqHMtpB4imzzzz';

const id = (over: Partial<MemberIdentity> = {}): MemberIdentity => ({
  address: ADDR,
  spaceName: null,
  qnsName: null,
  globalName: null,
  ...over,
});

describe('resolveIdentity — space scope', () => {
  it('ranks a deliberate per-space name above the QNS name', () => {
    const r = resolveIdentity(
      id({ spaceName: 'Mod Alice', globalName: 'Alice Smith', qnsName: 'alice' }),
      { scope: 'space' },
    );
    expect(r).toEqual({ name: 'Mod Alice', isQnsVerified: false });
  });

  it('treats a per-space name EQUAL to the global name as the join echo', () => {
    const r = resolveIdentity(
      id({ spaceName: 'Alice Smith', globalName: 'Alice Smith', qnsName: 'alice' }),
      { scope: 'space' },
    );
    expect(r).toEqual({ name: 'alice', isQnsVerified: true });
  });

  it('keeps a per-space name when the global name is unknown', () => {
    const r = resolveIdentity(id({ spaceName: 'Alice Smith' }), { scope: 'space' });
    expect(r).toEqual({ name: 'Alice Smith', isQnsVerified: false });
  });

  it('falls to the global name when no QNS name is elected', () => {
    const r = resolveIdentity(id({ globalName: 'Alice Smith' }), { scope: 'space' });
    expect(r).toEqual({ name: 'Alice Smith', isQnsVerified: false });
  });

  it('falls to a truncated address when every tier is null', () => {
    const r = resolveIdentity(id(), { scope: 'space' });
    expect(r.isQnsVerified).toBe(false);
    expect(r.name).toContain('…');
  });
});

describe('resolveIdentity — global scope', () => {
  it('ignores the per-space name entirely', () => {
    const r = resolveIdentity(
      id({ spaceName: 'Mod Alice', globalName: 'Alice Smith', qnsName: 'alice' }),
      { scope: 'global' },
    );
    expect(r).toEqual({ name: 'alice', isQnsVerified: true });
  });

  it('ranks the QNS name above the global name', () => {
    const r = resolveIdentity(id({ globalName: 'Alice Smith', qnsName: 'alice' }), {
      scope: 'global',
    });
    expect(r).toEqual({ name: 'alice', isQnsVerified: true });
  });
});

describe('resolveIdentity — the forged-suffix guard applies to every tier', () => {
  it('drops a per-space name ending in .q', () => {
    const r = resolveIdentity(id({ spaceName: 'alice.q', globalName: 'Mallory' }), {
      scope: 'space',
    });
    expect(r).toEqual({ name: 'Mallory', isQnsVerified: false });
  });

  it('drops a forged name BEFORE the echo comparison', () => {
    // Compared raw, 'alice.q' !== 'Mallory' reads as a deliberate per-space
    // name and would be returned outright.
    const r = resolveIdentity(
      id({ spaceName: 'alice.q', globalName: 'Mallory', qnsName: 'mallory' }),
      { scope: 'space' },
    );
    expect(r).toEqual({ name: 'mallory', isQnsVerified: true });
  });

  it('drops a global name ending in .q', () => {
    const r = resolveIdentity(id({ globalName: 'alice.q' }), { scope: 'global' });
    expect(r.name).not.toBe('alice.q');
  });

  it('drops a qnsName that already carries the suffix', () => {
    const r = resolveIdentity(id({ qnsName: 'alice.q', globalName: 'Mallory' }), {
      scope: 'global',
    });
    expect(r).toEqual({ name: 'Mallory', isQnsVerified: false });
  });

  it('folds confusable Unicode dots', () => {
    const r = resolveIdentity(id({ spaceName: 'alice．q', globalName: 'Mallory' }), {
      scope: 'space',
    });
    expect(r).toEqual({ name: 'Mallory', isQnsVerified: false });
  });

  it('leaves a mid-name dot alone', () => {
    const r = resolveIdentity(id({ globalName: 'jane.doe' }), { scope: 'global' });
    expect(r.name).toBe('jane.doe');
  });
});

describe('resolveIdentity — whitespace is absence', () => {
  it('treats a whitespace-only tier as null', () => {
    const r = resolveIdentity(id({ globalName: '   ', qnsName: 'alice' }), {
      scope: 'global',
    });
    expect(r).toEqual({ name: 'alice', isQnsVerified: true });
  });
});
