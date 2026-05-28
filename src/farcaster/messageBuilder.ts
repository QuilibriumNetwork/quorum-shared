/**
 * Build, sign, and serialize Farcaster Message protobuf payloads suitable
 * for POST /v1/submitMessage.
 *
 * Field numbers mirror hypersnap/proto/definitions/message.proto exactly;
 * any change to the proto must be reflected here.
 */

import { blake3 } from '@noble/hashes/blake3.js';
import { ProtoWriter } from './protoWire';

// ---------------------------------------------------------------------------
// Enums (matching message.proto)
// ---------------------------------------------------------------------------

export enum MessageType {
  NONE = 0,
  CAST_ADD = 1,
  CAST_REMOVE = 2,
  REACTION_ADD = 3,
  REACTION_REMOVE = 4,
  LINK_ADD = 5,
  LINK_REMOVE = 6,
  VERIFICATION_ADD_ETH_ADDRESS = 7,
  VERIFICATION_REMOVE = 8,
  USER_DATA_ADD = 11,
  USERNAME_PROOF = 12,
  FRAME_ACTION = 13,
  LINK_COMPACT_STATE = 14,
  LEND_STORAGE = 15,
  KEY_ADD = 16,
  KEY_REMOVE = 17,
}

export enum HashScheme {
  NONE = 0,
  BLAKE3 = 1,
}

export enum SignatureScheme {
  NONE = 0,
  ED25519 = 1,
  EIP712 = 2,
}

export enum FarcasterNetwork {
  NONE = 0,
  MAINNET = 1,
  TESTNET = 2,
  DEVNET = 3,
}

export enum ReactionType {
  NONE = 0,
  LIKE = 1,
  RECAST = 2,
}

export enum UserDataType {
  NONE = 0,
  PFP = 1,
  DISPLAY = 2,
  BIO = 3,
  URL = 5,
  USERNAME = 6,
  LOCATION = 7,
  TWITTER = 8,
  GITHUB = 9,
  BANNER = 10,
  PRIMARY_ADDRESS_ETHEREUM = 11,
  PRIMARY_ADDRESS_SOLANA = 12,
  PROFILE_TOKEN = 13,
}

export enum CastType {
  CAST = 0,
  LONG_CAST = 1,
  TEN_K_CAST = 2,
}

/** Farcaster epoch (ms): 2021-01-01 00:00:00 UTC. */
export const FARCASTER_EPOCH_MS = 1609459200000;

/** Convert a JS Date or ms-since-epoch to Farcaster epoch seconds. */
export function farcasterTimestamp(now: number = Date.now()): number {
  if (now < FARCASTER_EPOCH_MS) return 0;
  return Math.floor((now - FARCASTER_EPOCH_MS) / 1000);
}

// ---------------------------------------------------------------------------
// Body shapes
// ---------------------------------------------------------------------------

export type CastEmbed = { url: string } | { castId: { fid: number; hash: Uint8Array } };

export interface CastAddInput {
  text: string;
  embeds?: CastEmbed[];
  /** Mentioned FIDs aligned with `mentionsPositions`. */
  mentions?: number[];
  mentionsPositions?: number[];
  parent?:
    | { castId: { fid: number; hash: Uint8Array } }
    | { url: string };
  type?: CastType;
}

export interface CastRemoveInput {
  targetHash: Uint8Array;
}

export interface ReactionInput {
  type: ReactionType;
  target:
    | { castId: { fid: number; hash: Uint8Array } }
    | { url: string };
}

export interface LinkInput {
  type: string;
  targetFid: number;
  displayTimestamp?: number;
}

export interface UserDataInput {
  type: UserDataType;
  value: string;
}

export interface KeyAddInput {
  /** 32-byte Ed25519 public key. */
  key: Uint8Array;
  /** EIP-712 custody signature over the SignedKeyRequest typed data. */
  custodySignature: Uint8Array;
  /** Farcaster epoch seconds after which the custody signature is invalid. */
  deadline: number;
  /** Per-FID custody nonce (monotonic). */
  nonce: number;
  /** ABI-encoded SignedKeyRequestMetadata bytes. */
  metadata: Uint8Array;
  /** MessageType enum values the signer is allowed to sign. */
  scopes: MessageType[];
  /** Sliding TTL window in seconds (max enforced server-side). */
  ttl: number;
  /** Optional: tx hash of the FID registration. */
  registrationTxHash?: Uint8Array;
  /** Always 1 (SIGNED_KEY_REQUEST). */
  metadataType?: number;
  /** Always 1 (Ed25519). */
  keyType?: number;
}

export interface KeyRemoveInput {
  /** 32-byte Ed25519 public key to revoke. */
  key: Uint8Array;
  /** Custody (EIP-712) or self (Ed25519) signature. */
  signature: Uint8Array;
  /** 1 = custody (EIP-712), 2 = self (Ed25519). */
  signatureType: 1 | 2;
  deadline: number;
  nonce: number;
}

// ---------------------------------------------------------------------------
// Body encoders → MessageData bytes (without envelope)
// ---------------------------------------------------------------------------

function encodeCastId(fid: number, hash: Uint8Array): Uint8Array {
  const w = new ProtoWriter();
  w.writeVarintField(1, BigInt(fid));
  w.writeBytesField(2, hash);
  return w.bytes();
}

function encodeEmbed(e: CastEmbed): Uint8Array {
  const w = new ProtoWriter();
  if ('url' in e) {
    w.writeStringField(1, e.url);
  } else {
    w.writeSubMessage(2, encodeCastId(e.castId.fid, e.castId.hash));
  }
  return w.bytes();
}

export function encodeCastAddBody(input: CastAddInput): Uint8Array {
  const w = new ProtoWriter();
  // field 1: embeds_deprecated (skipped — proto3 default empty)
  if (input.mentions && input.mentions.length > 0) {
    w.writePackedVarint(2, input.mentions.map((m) => BigInt(m)));
  }
  if (input.parent && 'castId' in input.parent) {
    w.writeSubMessage(3, encodeCastId(input.parent.castId.fid, input.parent.castId.hash));
  } else if (input.parent && 'url' in input.parent) {
    w.writeStringField(7, input.parent.url);
  }
  w.writeStringField(4, input.text);
  if (input.mentionsPositions && input.mentionsPositions.length > 0) {
    w.writePackedVarint(5, input.mentionsPositions.map((p) => BigInt(p)));
  }
  for (const embed of input.embeds ?? []) {
    w.writeSubMessage(6, encodeEmbed(embed));
  }
  if (input.type !== undefined && input.type !== CastType.CAST) {
    w.writeVarintField(8, input.type);
  }
  return w.bytes();
}

export function encodeCastRemoveBody(input: CastRemoveInput): Uint8Array {
  const w = new ProtoWriter();
  w.writeBytesField(1, input.targetHash);
  return w.bytes();
}

export function encodeReactionBody(input: ReactionInput): Uint8Array {
  const w = new ProtoWriter();
  w.writeVarintField(1, input.type);
  if ('castId' in input.target) {
    w.writeSubMessage(2, encodeCastId(input.target.castId.fid, input.target.castId.hash));
  } else {
    w.writeStringField(3, input.target.url);
  }
  return w.bytes();
}

export function encodeLinkBody(input: LinkInput): Uint8Array {
  const w = new ProtoWriter();
  w.writeStringField(1, input.type);
  if (input.displayTimestamp !== undefined) {
    w.writeVarintField(2, input.displayTimestamp);
  }
  w.writeVarintField(3, BigInt(input.targetFid));
  return w.bytes();
}

export function encodeUserDataBody(input: UserDataInput): Uint8Array {
  const w = new ProtoWriter();
  w.writeVarintField(1, input.type);
  w.writeStringField(2, input.value);
  return w.bytes();
}

export function encodeKeyAddBody(input: KeyAddInput): Uint8Array {
  if (input.key.length !== 32) throw new Error('KeyAdd.key must be 32 bytes');
  if (input.scopes.length === 0) throw new Error('KeyAdd.scopes must be non-empty');
  if (input.ttl <= 0) throw new Error('KeyAdd.ttl must be > 0');
  const w = new ProtoWriter();
  w.writeBytesField(1, input.key);
  w.writeVarintField(2, input.keyType ?? 1);
  w.writeBytesField(3, input.custodySignature);
  w.writeVarintField(4, input.deadline);
  w.writeVarintField(5, input.nonce);
  w.writeBytesField(6, input.metadata);
  w.writeVarintField(7, input.metadataType ?? 1);
  if (input.registrationTxHash && input.registrationTxHash.length > 0) {
    w.writeBytesField(8, input.registrationTxHash);
  }
  w.writePackedInt32(9, input.scopes);
  w.writeVarintField(10, input.ttl);
  return w.bytes();
}

export function encodeKeyRemoveBody(input: KeyRemoveInput): Uint8Array {
  if (input.key.length !== 32) throw new Error('KeyRemove.key must be 32 bytes');
  const w = new ProtoWriter();
  w.writeBytesField(1, input.key);
  w.writeBytesField(2, input.signature);
  w.writeVarintField(3, input.signatureType);
  w.writeVarintField(4, input.deadline);
  w.writeVarintField(5, input.nonce);
  return w.bytes();
}

// ---------------------------------------------------------------------------
// MessageData + Message envelope
// ---------------------------------------------------------------------------

export interface MessageDataInput {
  type: MessageType;
  fid: number;
  /** Farcaster epoch seconds. Defaults to now. */
  timestamp?: number;
  network?: FarcasterNetwork;
  body:
    | { castAddBody: CastAddInput }
    | { castRemoveBody: CastRemoveInput }
    | { reactionBody: ReactionInput }
    | { linkBody: LinkInput }
    | { userDataBody: UserDataInput }
    | { keyAddBody: KeyAddInput }
    | { keyRemoveBody: KeyRemoveInput };
}

export function encodeMessageData(input: MessageDataInput): Uint8Array {
  const w = new ProtoWriter();
  w.writeVarintField(1, input.type);
  w.writeVarintField(2, BigInt(input.fid));
  w.writeVarintField(3, input.timestamp ?? farcasterTimestamp());
  w.writeVarintField(4, input.network ?? FarcasterNetwork.MAINNET);

  if ('castAddBody' in input.body) {
    w.writeSubMessage(5, encodeCastAddBody(input.body.castAddBody));
  } else if ('castRemoveBody' in input.body) {
    w.writeSubMessage(6, encodeCastRemoveBody(input.body.castRemoveBody));
  } else if ('reactionBody' in input.body) {
    w.writeSubMessage(7, encodeReactionBody(input.body.reactionBody));
  } else if ('userDataBody' in input.body) {
    w.writeSubMessage(12, encodeUserDataBody(input.body.userDataBody));
  } else if ('linkBody' in input.body) {
    w.writeSubMessage(14, encodeLinkBody(input.body.linkBody));
  } else if ('keyAddBody' in input.body) {
    w.writeSubMessage(19, encodeKeyAddBody(input.body.keyAddBody));
  } else if ('keyRemoveBody' in input.body) {
    w.writeSubMessage(20, encodeKeyRemoveBody(input.body.keyRemoveBody));
  }
  return w.bytes();
}

export interface MessageEnvelopeInput {
  /** Already-encoded MessageData bytes. The hash is taken over these. */
  dataBytes: Uint8Array;
  /** Truncated (20-byte) BLAKE3 of `dataBytes`. */
  hash: Uint8Array;
  /** Detached signature over `hash`. */
  signature: Uint8Array;
  signatureScheme: SignatureScheme;
  /** Signer public key (Ed25519 32 bytes, or EIP-712 custody address bytes). */
  signer: Uint8Array;
}

/** BLAKE3 truncated to 20 bytes — matches hypersnap's blake3_20. */
export function blake3_20(data: Uint8Array): Uint8Array {
  return blake3(data, { dkLen: 20 });
}

export function encodeMessageEnvelope(input: MessageEnvelopeInput): Uint8Array {
  const w = new ProtoWriter();
  // field 1 (data): we use the bytes form (field 7) to ensure stable signing
  // bytes. We still emit field 1 with the same MessageData so libraries that
  // parse `data` instead of `data_bytes` still see the body.
  // …but to stay consistent with the on-the-wire requirements we set data_bytes
  // only and leave field 1 absent. The hub accepts either form per
  // message.proto:17.
  w.writeBytesField(2, input.hash);
  w.writeVarintField(3, HashScheme.BLAKE3);
  w.writeBytesField(4, input.signature);
  w.writeVarintField(5, input.signatureScheme);
  w.writeBytesField(6, input.signer);
  w.writeBytesField(7, input.dataBytes);
  return w.bytes();
}

// ---------------------------------------------------------------------------
// Signer interface
// ---------------------------------------------------------------------------

/**
 * Signs the 20-byte blake3 hash of the MessageData. Implementations:
 *   - Ed25519: noble/curves ed25519.sign(hash, privateKey) → 64-byte signature.
 *   - EIP-712 (KeyAdd/KeyRemove custody): the *outer* envelope signature is
 *     the same secp256k1 ECDSA over the typed-data hash that produced the
 *     custody-signature field — the implementer is expected to compute that
 *     and supply both via SignedKeyRequest helpers.
 */
export interface FarcasterSigner {
  scheme: SignatureScheme;
  /** Signer public key bytes that go into Message.signer. */
  publicKey: Uint8Array;
  /** Sign the 20-byte BLAKE3 hash. */
  sign(hash: Uint8Array): Promise<Uint8Array>;
}

/** End-to-end: encode MessageData → hash → sign → wrap in envelope. */
export async function buildSignedMessage(
  data: MessageDataInput,
  signer: FarcasterSigner,
): Promise<Uint8Array> {
  const dataBytes = encodeMessageData(data);
  const hash = blake3_20(dataBytes);
  const signature = await signer.sign(hash);
  return encodeMessageEnvelope({
    dataBytes,
    hash,
    signature,
    signatureScheme: signer.scheme,
    signer: signer.publicKey,
  });
}
