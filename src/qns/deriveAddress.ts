import { sha256 } from '@noble/hashes/sha2';
import { base58btc } from 'multiformats/bases/base58';

/**
 * Derive a libp2p-style "Qm…" address from an ed448 public key.
 *
 * Mirrors quorum-mobile's `services/onboarding/keyService.ts` `deriveAddress`
 * so both apps agree byte-for-byte: SHA-256 the key, wrap as a sha2-256
 * multihash (code 0x12, length 0x20=32, then the digest), then base58btc-encode.
 * The result is the canonical IPFS CIDv0 shape ("Qm" + 44 base58 chars).
 *
 * Mobile uses `multihashes` + `bs58`; shared has neither, so we build the
 * multihash header inline and use `multiformats`' base58btc (same Bitcoin
 * alphabet as `bs58`). The base58btc `encode` prepends the multibase prefix
 * 'z', which we strip to get the raw "Qm…" address.
 *
 * @param publicKey - ed448 public key as a Uint8Array, or a hex string
 *   (optionally `0x`-prefixed).
 */
export function deriveAddress(publicKey: Uint8Array | string): string {
  const keyBytes =
    typeof publicKey === 'string'
      ? hexToBytes(publicKey.replace(/^0x/, ''))
      : publicKey;

  const digest = sha256(keyBytes);

  // sha2-256 multihash: 0x12 (code) | 0x20 (length=32) | 32-byte digest
  const multihash = new Uint8Array(2 + digest.length);
  multihash[0] = 0x12;
  multihash[1] = 0x20;
  multihash.set(digest, 2);

  // base58btc.encode returns a multibase string prefixed with 'z'; drop it.
  return base58btc.encode(multihash).slice(1);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
