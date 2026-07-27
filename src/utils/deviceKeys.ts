import type { SigningProvider } from '../signing';
import type { SpaceMemberDevice } from '../types';
import {
  bytesToBase64,
  hexToBytes,
  stringToBytes,
} from './encoding';
import { deriveInboxAddress } from './messageAuth';

/**
 * Per-device space signing keys, admitted via master-identity-signed statements.
 *
 * Multi-device breaks the single-key verified-signer model: each device signs
 * space messages with its own per-space key, so a second device's key is not
 * the one bound in receivers' member tables and its control messages are
 * dropped. The durable fix admits MULTIPLE signing keys per member, one per
 * device — but only when the key arrives inside a statement signed by the
 * user's MASTER identity key (the Ed448 key every device already holds and
 * whose hash IS the user_address already stored in every member row).
 *
 * This module is the single cross-platform source of truth for:
 *  - the statement wire shapes,
 *  - the canonical bytes both platforms sign AND verify (must be byte-identical
 *    or signatures fail across desktop/mobile — the whole point of putting it
 *    here, mirroring buildMessageFingerprint),
 *  - the receive-side verdict (identity self-check, skew, last-write-wins vs a
 *    stored admission/tombstone), with the Ed448 verification injected via the
 *    app's SigningProvider (WASM on desktop, native on mobile).
 *
 * It deliberately does NOT touch the member row's join-bound `inbox_address`:
 * admissions live in their own store, so a statement can never poison the
 * verified-signer binding (the #243 lesson). The member-existence / not-kicked
 * gate is enforced at auth time by resolveVerifiedSender, not here — so an
 * admission whose join row has not arrived yet is still storable (bootstrap
 * friendly) but resolves to nobody until the row exists.
 */

/** Statement kinds carried as new hub control envelopes. */
export const DEVICE_KEY_STATEMENT_TYPES = [
  'announce-keys',
  'revoke-device',
] as const;

export type DeviceKeyStatementType = (typeof DEVICE_KEY_STATEMENT_TYPES)[number];

/**
 * Domain separators: prefix the signed bytes so a statement signature can never
 * be confused with a config-upload or registration signature made by the same
 * master key. Versioned so the format can evolve without ambiguity.
 */
export const ANNOUNCE_KEYS_DOMAIN = 'quorum:announce-keys:v1';
export const REVOKE_DEVICE_DOMAIN = 'quorum:revoke-device:v1';

/** Reject a statement whose timestamp is further than this into the future. */
export const DEVICE_KEY_STATEMENT_MAX_SKEW_MS = 30_000;

/** Upper bound on admitted (non-revoked) devices per member per space (anti-DoS). */
export const MAX_DEVICES_PER_MEMBER = 10;

/** "device D of user U signs space S with key K". */
export interface AnnounceKeysStatement {
  type: 'announce-keys';
  /** Master user address; must equal deriveInboxAddress(userPublicKey). */
  userAddress: string;
  /** Master Ed448 public key (hex) that signed this statement. */
  userPublicKey: string;
  spaceId: string;
  /** The device's DM inbox_address — attribution + revocation handle. */
  deviceInboxAddress: string;
  /** The device's per-space Ed448 signing public key (hex) being admitted. */
  spaceKeyPublicKey: string;
  timestamp: number;
  /** Ed448 signature (hex) by the master key over buildDeviceKeyStatementBytes(). */
  signature: string;
}

/** "device D of user U is no longer trusted in space S". */
export interface RevokeDeviceStatement {
  type: 'revoke-device';
  userAddress: string;
  userPublicKey: string;
  spaceId: string;
  deviceInboxAddress: string;
  timestamp: number;
  signature: string;
}

export type DeviceKeyStatement = AnnounceKeysStatement | RevokeDeviceStatement;

export function isDeviceKeyStatementType(
  type: string
): type is DeviceKeyStatementType {
  return (DEVICE_KEY_STATEMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Canonical bytes (as a UTF-8 string) that the master key signs and receivers
 * verify. Fixed field order, newline-delimited (never present in a base58
 * address or hex key), domain-prefixed. MUST stay byte-identical across
 * platforms and versions — golden-tested. `userPublicKey` is intentionally NOT
 * included: userAddress is bound here, the signature is verified WITH
 * userPublicKey, and userAddress === deriveInboxAddress(userPublicKey) is
 * checked separately, so all three are transitively bound.
 */
export function buildDeviceKeyStatementBytes(
  statement: DeviceKeyStatement
): string {
  if (statement.type === 'announce-keys') {
    return [
      ANNOUNCE_KEYS_DOMAIN,
      statement.userAddress,
      statement.spaceId,
      statement.deviceInboxAddress,
      statement.spaceKeyPublicKey,
      String(statement.timestamp),
    ].join('\n');
  }
  return [
    REVOKE_DEVICE_DOMAIN,
    statement.userAddress,
    statement.spaceId,
    statement.deviceInboxAddress,
    String(statement.timestamp),
  ].join('\n');
}

export type DeviceKeyRejectReason =
  | 'malformed'
  | 'identity-mismatch'
  | 'future-timestamp'
  | 'stale'
  | 'bad-signature';

/**
 * Receive-side verdict. `admit` yields the row to upsert; `revoke` yields the
 * tombstone to record (mark matching admission revoked, or store a
 * timestamped tombstone if no admission is present yet); `reject` is dropped.
 */
export type DeviceKeyStatementVerdict =
  | { action: 'admit'; device: SpaceMemberDevice }
  | {
      action: 'revoke';
      spaceId: string;
      userAddress: string;
      deviceInboxAddress: string;
      timestamp: number;
    }
  | { action: 'reject'; reason: DeviceKeyRejectReason };

/** The stored state for the same (spaceId, userAddress, deviceInboxAddress), if any. */
export interface ExistingDeviceKeyRecord {
  timestamp: number;
  revoked: boolean;
}

function hasRequiredFields(s: DeviceKeyStatement): boolean {
  const common =
    !!s.userAddress &&
    !!s.userPublicKey &&
    !!s.spaceId &&
    !!s.deviceInboxAddress &&
    typeof s.timestamp === 'number' &&
    Number.isFinite(s.timestamp) &&
    !!s.signature;
  if (!common) return false;
  if (s.type === 'announce-keys') return !!s.spaceKeyPublicKey;
  return s.type === 'revoke-device';
}

/**
 * Verify an incoming device-key statement and decide what to do with it.
 *
 * Cheap checks (shape, self-certifying identity, clock skew, last-write-wins)
 * run before the Ed448 verification so a stale or malformed statement never
 * pays for a signature check. Fails closed on every gap.
 *
 * @param provider  app's Ed448 verifier (WASM/native) — only verifyEd448 is used
 * @param statement the incoming statement
 * @param existing  stored state for the same device tag, if any (for LWW)
 * @param now       injectable clock (ms) for testing; defaults to Date.now()
 */
export async function verifyDeviceKeyStatement(
  provider: Pick<SigningProvider, 'verifyEd448'>,
  statement: DeviceKeyStatement,
  existing: ExistingDeviceKeyRecord | undefined,
  now: number = Date.now()
): Promise<DeviceKeyStatementVerdict> {
  if (!isDeviceKeyStatementType(statement?.type) || !hasRequiredFields(statement)) {
    return { action: 'reject', reason: 'malformed' };
  }

  // Self-certifying identity: the signer's master public key must hash to the
  // claimed user address (the same value already bound in every member row).
  if (deriveInboxAddress(statement.userPublicKey) !== statement.userAddress) {
    return { action: 'reject', reason: 'identity-mismatch' };
  }

  // A future-dated statement could otherwise outlive/pre-empt a later
  // revocation; bound how far ahead we accept.
  if (statement.timestamp > now + DEVICE_KEY_STATEMENT_MAX_SKEW_MS) {
    return { action: 'reject', reason: 'future-timestamp' };
  }

  // Last-write-wins: only a strictly newer statement changes state. Equal
  // timestamps are deterministic no-ops (never flip admit<->revoke).
  if (existing && statement.timestamp <= existing.timestamp) {
    return { action: 'reject', reason: 'stale' };
  }

  const messageBase64 = bytesToBase64(
    stringToBytes(buildDeviceKeyStatementBytes(statement))
  );
  const publicKeyBase64 = bytesToBase64(hexToBytes(statement.userPublicKey));
  const signatureBase64 = bytesToBase64(hexToBytes(statement.signature));
  const valid = await provider.verifyEd448(
    publicKeyBase64,
    messageBase64,
    signatureBase64
  );
  if (!valid) {
    return { action: 'reject', reason: 'bad-signature' };
  }

  if (statement.type === 'revoke-device') {
    return {
      action: 'revoke',
      spaceId: statement.spaceId,
      userAddress: statement.userAddress,
      deviceInboxAddress: statement.deviceInboxAddress,
      timestamp: statement.timestamp,
    };
  }

  return {
    action: 'admit',
    device: {
      spaceId: statement.spaceId,
      userAddress: statement.userAddress,
      deviceInboxAddress: statement.deviceInboxAddress,
      inboxAddress: deriveInboxAddress(statement.spaceKeyPublicKey),
      spaceKeyPublicKey: statement.spaceKeyPublicKey,
      timestamp: statement.timestamp,
      revoked: false,
    },
  };
}
