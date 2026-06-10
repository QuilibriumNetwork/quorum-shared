import { describe, it, expect } from 'vitest';
import { deriveAddress } from './deriveAddress';

describe('deriveAddress', () => {
  it('derives a Qm… address from a hex ed448 public key', () => {
    // 57-byte ed448 public key, hex (114 hex chars)
    const pubHex =
      'a8b3f6c2d4e5061728394a5b6c7d8e9f0011223344556677889900aabbccddeeff' +
      '00112233445566778899aabbccddee0011223344556677';
    const addr = deriveAddress(pubHex);
    expect(addr.startsWith('Qm')).toBe(true);
    expect(addr.length).toBe(46);
  });

  it('accepts a 0x-prefixed hex string', () => {
    const pubHex = '0x' + 'ab'.repeat(57);
    expect(deriveAddress(pubHex).startsWith('Qm')).toBe(true);
  });

  it('accepts a Uint8Array', () => {
    const bytes = new Uint8Array(57).fill(7);
    expect(deriveAddress(bytes).startsWith('Qm')).toBe(true);
  });

  it('is deterministic', () => {
    const bytes = new Uint8Array(57).fill(3);
    expect(deriveAddress(bytes)).toBe(deriveAddress(bytes));
  });

  it('produces the canonical sha2-256 multihash signature (Qm + 44 base58 chars)', () => {
    // sha2-256 multihash (0x12 0x20 + 32-byte digest) base58btc-encodes to
    // exactly 46 chars starting "Qm" — the well-known IPFS CIDv0 shape.
    const addr = deriveAddress(new Uint8Array(57).fill(1));
    expect(addr).toMatch(/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/);
  });
});
