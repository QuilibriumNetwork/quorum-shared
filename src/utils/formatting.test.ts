import { describe, it, expect } from 'vitest';
import { formatAddress } from './formatting';

// Real CIDv0 Quilibrium address (46 chars: "Qm" + 44 base58).
const ADDR = 'QmQuCGpEgVKpYZKYuFu2J49zHXnA8vZtEqHMtpB4imXST1';

describe('formatAddress', () => {
  describe('Qm-aware slicing', () => {
    it('keeps Qm visible and counts start AFTER the prefix (default 6/6)', () => {
      // "Qm" + 6 meaningful + "…" + 6 = true 12-char anchor.
      expect(formatAddress(ADDR)).toBe('QmQuCGpE…imXST1');
    });

    it('honors custom start/end', () => {
      expect(formatAddress(ADDR, 4, 4)).toBe('QmQuCG…XST1');
      expect(formatAddress(ADDR, 10, 8)).toBe('QmQuCGpEgVKp…B4imXST1');
    });

    it('uses the Unicode ellipsis (…), not ASCII dots', () => {
      expect(formatAddress(ADDR)).toContain('…');
      expect(formatAddress(ADDR)).not.toContain('...');
    });
  });

  describe('passthrough cases', () => {
    it('returns @usernames verbatim', () => {
      expect(formatAddress('@alice')).toBe('@alice');
    });

    it('returns empty string for empty/null/undefined', () => {
      expect(formatAddress('')).toBe('');
      expect(formatAddress(null)).toBe('');
      expect(formatAddress(undefined)).toBe('');
    });

    it('returns short addresses as-is (nothing meaningful to truncate)', () => {
      expect(formatAddress('Qm123456')).toBe('Qm123456');
    });
  });

  describe('non-Qm addresses', () => {
    it('falls back to plain start/end slicing when there is no Qm prefix', () => {
      expect(formatAddress('bafy1234567890abcdefghij')).toBe('bafy12…efghij');
    });
  });
});
