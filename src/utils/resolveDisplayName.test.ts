import { describe, it, expect } from 'vitest';
import { resolveDisplayName } from './resolveDisplayName';

const base = { address: 'QmV5xWMo5CYSxgAAy6emKFZZPCKwCsBZKZxXD3mCUZF2nX' };

describe('resolveDisplayName', () => {
  it('uses the per-space override when present (highest priority)', () => {
    const r = resolveDisplayName(
      { ...base, display_name: 'NicMod', primary_username: 'alice', name: 'Alice' },
      { spaceOverrideName: 'Nic (mod)' }
    );
    expect(r.name).toBe('Nic (mod)');
    expect(r.isQnsVerified).toBe(false);
  });

  it('uses the QNS username when there is no space override', () => {
    const r = resolveDisplayName(
      { ...base, primary_username: 'alice', display_name: 'Whatever' },
      {}
    );
    expect(r.name).toBe('alice');
    expect(r.isQnsVerified).toBe(true);
  });

  it('falls back to the global display name when no override and no QNS name', () => {
    const r = resolveDisplayName({ ...base, display_name: 'Alice A.' }, {});
    expect(r.name).toBe('Alice A.');
    expect(r.isQnsVerified).toBe(false);
  });

  it('falls back to `name` then truncated address when nothing else exists', () => {
    const r = resolveDisplayName({ ...base }, {});
    expect(r.isQnsVerified).toBe(false);
    expect(r.name.startsWith('Qm')).toBe(true);
    expect(r.name.length).toBeLessThan(base.address.length); // truncated
  });

  it('uses `name` over the truncated address when display_name is absent', () => {
    const r = resolveDisplayName({ ...base, name: 'legacy-name' }, {});
    expect(r.name).toBe('legacy-name');
    expect(r.isQnsVerified).toBe(false);
  });

  it('treats empty/whitespace names as absent', () => {
    const r = resolveDisplayName(
      { ...base, display_name: '   ', primary_username: 'alice' },
      { spaceOverrideName: '  ' }
    );
    expect(r.name).toBe('alice');
    expect(r.isQnsVerified).toBe(true);
  });

  it('never returns an empty name', () => {
    const r = resolveDisplayName({ address: 'QmShort' }, {});
    expect(r.name.length).toBeGreaterThan(0);
  });
});

/**
 * The forged-`.q` guard.
 *
 * `.q` is a trust marker and the ONLY signal a viewer gets — neither client
 * renders `isQnsVerified`. The input validator that forbids a display name
 * ending in `.q` runs on local text fields and nowhere on receive, so a
 * modified client can broadcast one and every honest recipient renders it
 * identically to a name somebody registered and elected primary.
 *
 * These cases pin the guard at the one function both clients call for every
 * name they render. It lives here rather than in a client adapter because the
 * previous arrangement — mobile enforcing it, desktop with no copy at all —
 * left desktop exposed to an attack mobile was immune to, on a shared network.
 */
describe('resolveDisplayName — a name cannot forge the verified .q marker', () => {
  it('drops a per-space override ending in .q', () => {
    const r = resolveDisplayName({ ...base, display_name: 'Alice' }, {
      spaceOverrideName: 'mallory.q',
    });
    expect(r.name).toBe('Alice');
    expect(r.isQnsVerified).toBe(false);
  });

  it('drops a display name ending in .q', () => {
    // The attack in full: broadcast `alice.q` as an ordinary display name and
    // every recipient renders it exactly like the real thing.
    const r = resolveDisplayName({ ...base, display_name: 'alice.q' }, {});
    expect(r.name).not.toBe('alice.q');
    expect(r.isQnsVerified).toBe(false);
    expect(r.name.startsWith('Qm')).toBe(true); // fell through to the address
  });

  it('drops a legacy `name` ending in .q', () => {
    const r = resolveDisplayName({ ...base, name: 'alice.q' }, {});
    expect(r.isQnsVerified).toBe(false);
    expect(r.name.startsWith('Qm')).toBe(true);
  });

  it('drops a primary_username that already carries the suffix', () => {
    // A QNS name is stored BARE — the suffix is presentation. One arriving with
    // `.q` on it is malformed however it got here, and would render `alice.q.q`.
    const r = resolveDisplayName({ ...base, primary_username: 'alice.q' }, {});
    expect(r.isQnsVerified).toBe(false);
    expect(r.name).not.toContain('.q.q');
  });

  it('folds confusable Unicode dots, so a lookalike cannot slip through', () => {
    // U+FF0E fullwidth full stop. A hand-rolled endsWith('.q') would miss it,
    // which is why this delegates to the same helper the input validator uses.
    const r = resolveDisplayName({ ...base, display_name: 'alice\uFF0Eq' }, {});
    expect(r.isQnsVerified).toBe(false);
    expect(r.name.startsWith('Qm')).toBe(true);
  });

  it('falls through to the next legitimate tier rather than to the address', () => {
    // Dropping the forged override must not also lose a real name below it.
    const r = resolveDisplayName(
      { ...base, primary_username: 'realowner' },
      { spaceOverrideName: 'realowner.q' },
    );
    expect(r.name).toBe('realowner');
    expect(r.isQnsVerified).toBe(true);
  });

  it('leaves a mid-name dot alone, because it cannot look verified', () => {
    // The rule is deliberately narrow: only a TRAILING `.q` can be mistaken for
    // a verified handle. Blocking every dot would break ordinary names.
    const r = resolveDisplayName({ ...base, display_name: 'jane.doe' }, {});
    expect(r.name).toBe('jane.doe');
  });

  it('leaves a name merely CONTAINING .q alone', () => {
    const r = resolveDisplayName({ ...base, display_name: 'alice.quinn' }, {});
    expect(r.name).toBe('alice.quinn');
  });
});
