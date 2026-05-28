/**
 * Signer lifecycle: provision a new Ed25519 signer + KEY_ADD it, and
 * renew when the sliding TTL is close to expiring.
 *
 * KEY_ADD message construction:
 *  1. Generate Ed25519 keypair K.
 *  2. EIP-712 sign(SignedKeyRequest{requestFid, key=K.pub, deadline}, custodyPriv)
 *     → embed into ABI-encoded SignedKeyRequestMetadata, set as
 *     KeyAddBody.metadata.
 *  3. EIP-712 sign(KeyAdd{fid, key=K.pub, keyType, scopes, ttl, nonce, deadline},
 *     custodyPriv) → KeyAddBody.custody_signature.
 *  4. Build MessageData{type: KEY_ADD, fid, body: keyAddBody}.
 *  5. hash = blake3_20(MessageData), sig = K.priv.sign(hash) (self-attestation).
 *  6. POST envelope{data_bytes, hash, signature, signer=K.pub} to
 *     /v1/submitMessage.
 *
 * Scopes default to every MessageType the validator allows (FULL_SIGNER_SCOPES).
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { getDefaultHypersnapClient, type HypersnapClient } from './hypersnapClient';
import {
  blake3_20,
  encodeMessageData,
  encodeMessageEnvelope,
  FarcasterNetwork,
  MessageType,
  SignatureScheme,
  type FarcasterSigner,
} from './messageBuilder';
import {
  addressFromCustodyPrivateKey,
  buildSignedKeyRequestMetadata,
  bytesToHex,
  hexToBytes,
  keyAddDigest,
  signEip712Digest,
} from './signedKeyRequest';
import type { SignerRecord, SignerStore } from './signerStore';

/** Per FIP, the max sliding TTL accepted by validators. */
export const MAX_SIGNER_TTL_SECONDS = 90 * 24 * 60 * 60;
/** Renew the signer when fewer than this many seconds of TTL remain. */
export const RENEW_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;
/** SignedKeyRequest deadline — 1 hour from now is enough to land the
 *  message; the validator only requires `deadline >= current_timestamp`. */
export const SIGNED_KEY_REQUEST_DEADLINE_SECONDS = 60 * 60;
export const ED25519_KEY_TYPE = 1;

/** Every MessageType the validator allows for an app-managed signer.
 *  KEY_ADD / KEY_REMOVE / NONE are forbidden — letting a signer authorize
 *  those would allow it to mint or revoke other signers. */
export const FULL_SIGNER_SCOPES: MessageType[] = [
  MessageType.CAST_ADD,
  MessageType.CAST_REMOVE,
  MessageType.REACTION_ADD,
  MessageType.REACTION_REMOVE,
  MessageType.LINK_ADD,
  MessageType.LINK_REMOVE,
  MessageType.VERIFICATION_ADD_ETH_ADDRESS,
  MessageType.VERIFICATION_REMOVE,
  MessageType.USER_DATA_ADD,
  MessageType.USERNAME_PROOF,
  MessageType.FRAME_ACTION,
  MessageType.LINK_COMPACT_STATE,
  MessageType.LEND_STORAGE,
];

// ---------------------------------------------------------------------------
// Signer construction from a record
// ---------------------------------------------------------------------------

/** Build a FarcasterSigner usable by write hooks from a stored record. */
export function signerFromRecord(record: SignerRecord): FarcasterSigner {
  const publicKey = hexToBytes(record.publicKeyHex);
  const privateKey = hexToBytes(record.privateKeyHex);
  return {
    scheme: SignatureScheme.ED25519,
    publicKey,
    sign: async (hash) => ed25519.sign(hash, privateKey),
  };
}

interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

function generateEd25519Keypair(): KeyPair {
  const { secretKey, publicKey } = ed25519.keygen();
  return { privateKey: secretKey, publicKey };
}

// ---------------------------------------------------------------------------
// Provisioning / renewal
// ---------------------------------------------------------------------------

export interface ProvisionParams {
  fid: number;
  /** Raw secp256k1 custody private key (32 bytes). */
  custodyPrivateKey: Uint8Array;
  /** Per-FID custody nonce — must be strictly greater than the prior
   *  KEY_ADD / KEY_REMOVE on this FID. Caller resolves from network state
   *  or local persistence. */
  nonce: number;
  /** Optional override for the TTL. Defaults to the FIP max (90 days). */
  ttlSeconds?: number;
  /** Optional override for the deadline (unix seconds). Default: now + 1h. */
  deadlineUnix?: number;
  scopes?: MessageType[];
  network?: FarcasterNetwork;
  hypersnap?: HypersnapClient;
}

export interface ProvisionResult {
  record: SignerRecord;
  submitResponse: unknown;
}

/**
 * Generate a fresh Ed25519 signer and register it with KEY_ADD signed by
 * the user's custody key.
 */
export async function provisionSigner(params: ProvisionParams): Promise<ProvisionResult> {
  if (params.custodyPrivateKey.length !== 32) {
    throw new Error('provisionSigner: custodyPrivateKey must be 32 bytes');
  }
  const ttl = params.ttlSeconds ?? MAX_SIGNER_TTL_SECONDS;
  const nowUnix = Math.floor(Date.now() / 1000);
  const deadline = params.deadlineUnix ?? nowUnix + SIGNED_KEY_REQUEST_DEADLINE_SECONDS;
  const scopes = params.scopes ?? FULL_SIGNER_SCOPES;
  const kp = generateEd25519Keypair();

  const submitResponse = await submitKeyAdd({
    fid: params.fid,
    signerPrivateKey: kp.privateKey,
    signerPublicKey: kp.publicKey,
    custodyPrivateKey: params.custodyPrivateKey,
    deadline,
    nonce: params.nonce,
    scopes,
    ttl,
    network: params.network,
    hypersnap: params.hypersnap,
  });

  const custodyAddress = addressFromCustodyPrivateKey(params.custodyPrivateKey);
  const record: SignerRecord = {
    fid: params.fid,
    publicKeyHex: bytesToHex(kp.publicKey),
    privateKeyHex: bytesToHex(kp.privateKey),
    registeredAtUnix: nowUnix,
    ttlSeconds: ttl,
    custodyAddress,
    deadlineUnix: deadline,
  };
  return { record, submitResponse };
}

export interface RenewParams {
  record: SignerRecord;
  custodyPrivateKey: Uint8Array;
  /** Strictly-greater nonce than the prior KEY_ADD / KEY_REMOVE. */
  nonce: number;
  ttlSeconds?: number;
  deadlineUnix?: number;
  hypersnap?: HypersnapClient;
}

/**
 * Re-issue KEY_ADD for the same Ed25519 key with a fresh sliding TTL.
 */
export async function renewSigner(params: RenewParams): Promise<{
  record: SignerRecord;
  submitResponse: unknown;
}> {
  if (params.custodyPrivateKey.length !== 32) {
    throw new Error('renewSigner: custodyPrivateKey must be 32 bytes');
  }
  const expectedSigner = addressFromCustodyPrivateKey(params.custodyPrivateKey);
  if (expectedSigner.toLowerCase() !== params.record.custodyAddress.toLowerCase()) {
    throw new Error('renewSigner: custody key does not match the address stored on the record');
  }
  const ttl = params.ttlSeconds ?? MAX_SIGNER_TTL_SECONDS;
  const nowUnix = Math.floor(Date.now() / 1000);
  const deadline = params.deadlineUnix ?? nowUnix + SIGNED_KEY_REQUEST_DEADLINE_SECONDS;
  const signerPublicKey = hexToBytes(params.record.publicKeyHex);
  const signerPrivateKey = hexToBytes(params.record.privateKeyHex);

  const submitResponse = await submitKeyAdd({
    fid: params.record.fid,
    signerPrivateKey,
    signerPublicKey,
    custodyPrivateKey: params.custodyPrivateKey,
    deadline,
    nonce: params.nonce,
    scopes: FULL_SIGNER_SCOPES,
    ttl,
    hypersnap: params.hypersnap,
  });

  return {
    record: {
      ...params.record,
      registeredAtUnix: nowUnix,
      ttlSeconds: ttl,
      deadlineUnix: deadline,
    },
    submitResponse,
  };
}

/**
 * Decide whether a stored record needs renewal — cheap, doesn't require
 * the custody key.
 */
export function needsRenewal(
  record: SignerRecord,
  nowUnix: number = Math.floor(Date.now() / 1000),
): boolean {
  const remaining = record.registeredAtUnix + record.ttlSeconds - nowUnix;
  return remaining <= RENEW_THRESHOLD_SECONDS;
}

/** Foreground orchestrator: load → check expiry → renew → persist. */
export async function renewIfNearExpiry(deps: {
  store: SignerStore;
  custodyPrivateKey: Uint8Array | (() => Promise<Uint8Array | null>);
  /** Resolver for the next per-FID custody nonce. */
  nextNonce: (fid: number) => Promise<number>;
  hypersnap?: HypersnapClient;
}): Promise<SignerRecord | null> {
  const current = await deps.store.get();
  if (!current) return null;
  if (!needsRenewal(current)) return current;
  const custody = typeof deps.custodyPrivateKey === 'function'
    ? await deps.custodyPrivateKey()
    : deps.custodyPrivateKey;
  if (!custody) return current;
  const nonce = await deps.nextNonce(current.fid);
  const { record } = await renewSigner({
    record: current,
    custodyPrivateKey: custody,
    nonce,
    hypersnap: deps.hypersnap,
  });
  await deps.store.save(record);
  return record;
}

// ---------------------------------------------------------------------------
// KEY_ADD submission internals
// ---------------------------------------------------------------------------

interface SubmitKeyAddParams {
  fid: number;
  signerPrivateKey: Uint8Array;
  signerPublicKey: Uint8Array;
  custodyPrivateKey: Uint8Array;
  /** Unix seconds. */
  deadline: number;
  nonce: number;
  scopes: MessageType[];
  ttl: number;
  network?: FarcasterNetwork;
  hypersnap?: HypersnapClient;
}

async function submitKeyAdd(params: SubmitKeyAddParams): Promise<unknown> {
  const client = params.hypersnap ?? getDefaultHypersnapClient();

  // Inner: SignedKeyRequestMetadata — binds the requestFid to the key
  // with a custody EIP-712 signature.
  const { metadata } = buildSignedKeyRequestMetadata({
    requestFid: params.fid,
    signerPublicKey: params.signerPublicKey,
    deadline: params.deadline,
    custodyPrivateKey: params.custodyPrivateKey,
  });

  // Outer-body custody_signature: EIP-712 over the KeyAdd typed data —
  // authorizes the custody address to mint *this exact* signer record.
  // The validator (key.rs:198) recovers this and compares against the
  // FID's custody address from IdRegisterEvent.
  const custodyDigest = keyAddDigest({
    fid: params.fid,
    key: params.signerPublicKey,
    keyType: ED25519_KEY_TYPE,
    scopes: params.scopes,
    ttl: params.ttl,
    nonce: params.nonce,
    deadline: params.deadline,
  });
  const custodySignature = signEip712Digest(custodyDigest, params.custodyPrivateKey);

  const dataBytes = encodeMessageData({
    type: MessageType.KEY_ADD,
    fid: params.fid,
    network: params.network ?? FarcasterNetwork.MAINNET,
    body: {
      keyAddBody: {
        key: params.signerPublicKey,
        custodySignature,
        deadline: params.deadline,
        nonce: params.nonce,
        metadata,
        scopes: params.scopes,
        ttl: params.ttl,
      },
    },
  });

  // Envelope: Ed25519 self-attestation. The signer key proves possession
  // of its own private key by signing the BLAKE3 hash of MessageData.
  const hash = blake3_20(dataBytes);
  const signature = ed25519.sign(hash, params.signerPrivateKey);

  const envelope = encodeMessageEnvelope({
    dataBytes,
    hash,
    signature,
    signatureScheme: SignatureScheme.ED25519,
    signer: params.signerPublicKey,
  });

  return client.submitMessage(envelope);
}
