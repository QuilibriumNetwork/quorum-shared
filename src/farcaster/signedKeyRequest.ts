/**
 * EIP-712 SignedKeyRequest builder and ABI encoder for the
 * SignedKeyRequestMetadata blob embedded in a KeyAddBody.
 *
 * Mirrors the verifier at hypersnap/src/core/validations/key.rs:298.
 * Field layout (struct hash domain) is identical to Farcaster's standard
 * signed-key-request schema; the EIP-712 domain name is hypersnap's own
 * "Farcaster KeyAdd" / version "1", chainId 1 (ETH mainnet, cosmetic — no
 * verifyingContract since nothing verifies on-chain).
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { logger } from '../utils/logger';

export const KEY_DOMAIN_NAME = 'Farcaster KeyAdd';
export const KEY_DOMAIN_VERSION = '1';
/** Cosmetic chainId — see hypersnap key.rs:101 + storage/store/account/gasless_key_merge.rs:101. */
export const SIGNED_KEY_REQUEST_CHAIN_ID = 1;

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

function utf8(s: string): Uint8Array {
  return enc.encode(s);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Encode a non-negative integer into a 32-byte big-endian word. */
function toUint256(value: number | bigint): Uint8Array {
  const v = typeof value === 'bigint' ? value : BigInt(value);
  if (v < 0n) throw new Error('toUint256: negative value');
  const out = new Uint8Array(32);
  let n = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

/** Encode a 20-byte address into a 32-byte left-padded word. */
function addressTo32(addressHex: string): Uint8Array {
  const stripped = addressHex.toLowerCase().startsWith('0x') ? addressHex.slice(2) : addressHex;
  if (stripped.length !== 40) {
    throw new Error(`addressTo32: expected 20-byte hex address, got ${stripped.length} chars`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 20; i++) {
    out[12 + i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.toLowerCase().startsWith('0x') ? hex.slice(2) : hex;
  if (stripped.length % 2 !== 0) throw new Error('hexToBytes: odd-length hex');
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// ---------------------------------------------------------------------------
// EIP-712 hashing
// ---------------------------------------------------------------------------

const EIP712_DOMAIN_TYPE = 'EIP712Domain(string name,string version,uint256 chainId)';
const SIGNED_KEY_REQUEST_TYPE = 'SignedKeyRequest(uint256 requestFid,bytes key,uint256 deadline)';
const KEY_ADD_TYPE =
  'KeyAdd(uint256 fid,bytes key,uint32 keyType,uint32[] scopes,uint32 ttl,uint32 nonce,uint256 deadline)';
const KEY_REMOVE_TYPE = 'KeyRemove(uint256 fid,bytes key,uint32 nonce,uint256 deadline)';

function domainSeparator(chainId: number): Uint8Array {
  const typeHash = keccak_256(utf8(EIP712_DOMAIN_TYPE));
  return keccak_256(
    concat(
      typeHash,
      keccak_256(utf8(KEY_DOMAIN_NAME)),
      keccak_256(utf8(KEY_DOMAIN_VERSION)),
      toUint256(chainId),
    ),
  );
}

function signedKeyRequestStructHash(requestFid: number | bigint, key: Uint8Array, deadline: number | bigint): Uint8Array {
  const typeHash = keccak_256(utf8(SIGNED_KEY_REQUEST_TYPE));
  return keccak_256(
    concat(
      typeHash,
      toUint256(requestFid),
      keccak_256(key),
      toUint256(deadline),
    ),
  );
}

/**
 * Encode a uint32 array as a packed sequence of 32-byte words for EIP-712
 * `uint32[]` field hashing — hash = keccak256(concat(toUint256(x_i))).
 */
function uint32ArrayHash(values: number[]): Uint8Array {
  const buf = new Uint8Array(values.length * 32);
  values.forEach((v, i) => buf.set(toUint256(v), i * 32));
  return keccak_256(buf);
}

function keyAddStructHash(p: {
  fid: number | bigint;
  key: Uint8Array;
  keyType: number;
  scopes: number[];
  ttl: number;
  nonce: number;
  deadline: number | bigint;
}): Uint8Array {
  const typeHash = keccak_256(utf8(KEY_ADD_TYPE));
  return keccak_256(
    concat(
      typeHash,
      toUint256(p.fid),
      keccak_256(p.key),
      toUint256(p.keyType),
      uint32ArrayHash(p.scopes),
      toUint256(p.ttl),
      toUint256(p.nonce),
      toUint256(p.deadline),
    ),
  );
}

function keyRemoveStructHash(p: {
  fid: number | bigint;
  key: Uint8Array;
  nonce: number;
  deadline: number | bigint;
}): Uint8Array {
  const typeHash = keccak_256(utf8(KEY_REMOVE_TYPE));
  return keccak_256(
    concat(
      typeHash,
      toUint256(p.fid),
      keccak_256(p.key),
      toUint256(p.nonce),
      toUint256(p.deadline),
    ),
  );
}

/**
 * Compute the EIP-712 digest a custody key must sign to authorize a
 * SignedKeyRequest. The 32-byte digest is what gets passed to the
 * secp256k1 signer.
 */
export function signedKeyRequestDigest(params: {
  requestFid: number | bigint;
  /** 32-byte Ed25519 public key (raw bytes). */
  key: Uint8Array;
  /** Unix epoch seconds after which the request is invalid. */
  deadline: number | bigint;
  chainId?: number;
}): Uint8Array {
  const chainId = params.chainId ?? SIGNED_KEY_REQUEST_CHAIN_ID;
  const ds = domainSeparator(chainId);
  const sh = signedKeyRequestStructHash(params.requestFid, params.key, params.deadline);
  return keccak_256(concat(new Uint8Array([0x19, 0x01]), ds, sh));
}

/**
 * Compute the EIP-712 digest for a KeyAdd authorization — the value the
 * custody key must sign for `KeyAddBody.custody_signature`.
 */
export function keyAddDigest(params: {
  fid: number | bigint;
  /** 32-byte Ed25519 signer public key. */
  key: Uint8Array;
  keyType: number;
  scopes: number[];
  ttl: number;
  nonce: number;
  /** Unix epoch seconds. */
  deadline: number | bigint;
  chainId?: number;
}): Uint8Array {
  const chainId = params.chainId ?? SIGNED_KEY_REQUEST_CHAIN_ID;
  const ds = domainSeparator(chainId);
  const sh = keyAddStructHash(params);
  return keccak_256(concat(new Uint8Array([0x19, 0x01]), ds, sh));
}

/** Companion of `keyAddDigest` for KeyRemove (custody-signed). */
export function keyRemoveDigest(params: {
  fid: number | bigint;
  key: Uint8Array;
  nonce: number;
  deadline: number | bigint;
  chainId?: number;
}): Uint8Array {
  const chainId = params.chainId ?? SIGNED_KEY_REQUEST_CHAIN_ID;
  const ds = domainSeparator(chainId);
  const sh = keyRemoveStructHash(params);
  return keccak_256(concat(new Uint8Array([0x19, 0x01]), ds, sh));
}

// ---------------------------------------------------------------------------
// secp256k1 signing (Ethereum-style)
// ---------------------------------------------------------------------------

/**
 * Sign the EIP-712 digest with a secp256k1 custody key. Produces the
 * Ethereum-style 65-byte signature (r || s || v) with v ∈ {27, 28} suitable
 * for embedding into SignedKeyRequestMetadata.
 */
export function signEip712Digest(digest: Uint8Array, custodyPrivateKey: Uint8Array): Uint8Array {
  if (digest.length !== 32) throw new Error('signEip712Digest: digest must be 32 bytes');
  if (custodyPrivateKey.length !== 32) {
    throw new Error('signEip712Digest: custody private key must be 32 bytes');
  }
  // Diagnostic: dump the raw signature bytes so we can see exactly what
  // noble is producing on Hermes.
  const recoveredBytes = secp256k1.sign(digest, custodyPrivateKey, {
    prehash: false,
    format: 'recovered',
  });
  const headHex = Array.from(recoveredBytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const tailHex = Array.from(recoveredBytes.slice(-8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  logger.log(
    `[signedKeyRequest] sign output: length=${recoveredBytes.length}, head=${headHex}, tail=${tailHex}, b0=${recoveredBytes[0]}, b64=${recoveredBytes[64]}`,
  );

  const sig = secp256k1.Signature.fromBytes(recoveredBytes, 'recovered');
  const recovery = sig.recovery;
  logger.log(`[signedKeyRequest] parsed sig.recovery=${recovery}`);

  if (recovery !== 0 && recovery !== 1) {
    throw new Error(`signEip712Digest: unexpected recovery id ${recovery}`);
  }
  const compact = sig.toBytes('compact');
  if (compact.length !== 64) {
    throw new Error(`signEip712Digest: compact signature is ${compact.length} bytes, expected 64`);
  }
  const out = new Uint8Array(65);
  out.set(compact, 0);       // out[0..64] = r || s
  out[64] = recovery + 27;   // out[64] = v (27 or 28)
  // Final wire-format signature: r || s || v(27/28). Logged so we can
  // verify the byte order on the wire matches Ethereum convention; if
  // an EIP-712 recovery elsewhere disagrees, the bytes here are the
  // ground truth.
  const finalHead = Array.from(out.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const finalTail = Array.from(out.slice(-4))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  logger.log(
    `[signedKeyRequest] FINAL signature (r||s||v): length=${out.length}, head=${finalHead}, tail=${finalTail}, v=${out[64]} (0x${out[64].toString(16)})`,
  );
  return out;
}

/**
 * Derive an Ethereum-style address (20-byte keccak hash of the uncompressed
 * public key, minus the leading 0x04 byte) from a custody private key.
 */
export function addressFromCustodyPrivateKey(privateKey: Uint8Array): string {
  const pub = secp256k1.getPublicKey(privateKey, false); // uncompressed (65 bytes, leading 0x04)
  const xy = pub.slice(1); // strip 0x04
  const hash = keccak_256(xy);
  return `0x${bytesToHex(hash.slice(12))}`;
}

// ---------------------------------------------------------------------------
// ABI encoding for SignedKeyRequestMetadata
// ---------------------------------------------------------------------------

/**
 * ABI-encode a `SignedKeyRequestMetadata` struct for embedding into
 * `KeyAddBody.metadata`. The on-the-wire format is the standard Solidity
 * tuple encoding of (uint256, address, bytes, uint256).
 */
export function abiEncodeSignedKeyRequestMetadata(input: {
  requestFid: number | bigint;
  requestSigner: string; // 0x-prefixed address
  signature: Uint8Array; // 65-byte EIP-712 signature
  deadline: number | bigint;
}): Uint8Array {
  const headSize = 32 * 4; // 4 tuple slots
  const sig = input.signature;
  const sigPaddedLen = Math.ceil(sig.length / 32) * 32;
  const sigPadded = new Uint8Array(sigPaddedLen);
  sigPadded.set(sig, 0);
  // signature tail = 32 bytes length + padded data
  const sigTail = concat(toUint256(sig.length), sigPadded);

  const heads = concat(
    toUint256(input.requestFid),
    addressTo32(input.requestSigner),
    toUint256(headSize), // offset to signature data (relative to the tuple start)
    toUint256(input.deadline),
  );

  const tuple = concat(heads, sigTail);

  // `SignedKeyRequestMetadata` carries a dynamic `bytes signature` member, so the
  // struct itself is a *dynamic* type. The standard Solidity encoding consumed by
  // `abi.decode(metadata, (SignedKeyRequestMetadata))` — both the on-chain
  // SignedKeyRequestValidator and the Snapchain/hypersnap KEY_ADD validator — is
  // `abi.encode((tuple))`, which prepends a 32-byte offset word pointing at the
  // start of the tuple data. Without this leading word the decoder reads
  // `requestFid` as the offset and overruns, rejecting the metadata — which made
  // every gasless KEY_ADD fail validation at merge time (the gateway 200s, but the
  // signer never registers), forcing casts onto the legacy path.
  return concat(toUint256(32), tuple);
}

// ---------------------------------------------------------------------------
// All-in-one helper
// ---------------------------------------------------------------------------

/**
 * Build the SignedKeyRequestMetadata bytes that go into KeyAddBody.metadata,
 * given the user's custody secp256k1 private key and the new signer key.
 */
export function buildSignedKeyRequestMetadata(params: {
  requestFid: number | bigint;
  /** 32-byte Ed25519 public key the user is authorizing. */
  signerPublicKey: Uint8Array;
  /** Unix epoch seconds at which the signature should expire. */
  deadline: number | bigint;
  /** secp256k1 custody key (32 bytes). */
  custodyPrivateKey: Uint8Array;
  chainId?: number;
}): { metadata: Uint8Array; signature: Uint8Array; requestSigner: string } {
  const digest = signedKeyRequestDigest({
    requestFid: params.requestFid,
    key: params.signerPublicKey,
    deadline: params.deadline,
    chainId: params.chainId,
  });
  const signature = signEip712Digest(digest, params.custodyPrivateKey);
  const requestSigner = addressFromCustodyPrivateKey(params.custodyPrivateKey);
  const metadata = abiEncodeSignedKeyRequestMetadata({
    requestFid: params.requestFid,
    requestSigner,
    signature,
    deadline: params.deadline,
  });
  return { metadata, signature, requestSigner };
}

// Local hex codec — exported under `hexToBytes` / `bytesToHex` only for
// sibling modules in this folder. The package-level barrel re-exports the
// canonical pair from src/utils/encoding.ts via `farcaster/index.ts`'s
// selective exports.
export { hexToBytes, bytesToHex };
