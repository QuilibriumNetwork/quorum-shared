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
