/**
 * Storage interface for a user's Hypersnap signer state.
 *
 * The host application (mobile = SecureStore, desktop = OS keyring) provides
 * an implementation. The shared module just defines the contract so signer
 * lifecycle code (provisioning, renewal, write hooks) can stay platform-agnostic.
 *
 * Two persisted records:
 *  - The Ed25519 keypair itself (private key must live in secure storage).
 *  - Metadata: when the current KeyAdd was registered, its TTL, the FID it
 *    was bound to, and the on-chain custody-signer address used. Used by
 *    the renewal job to decide when to refresh.
 */

export interface SignerRecord {
  /** FID the signer is registered against. */
  fid: number;
  /** 32-byte Ed25519 public key (hex, no 0x prefix). */
  publicKeyHex: string;
  /** 32-byte Ed25519 private key (hex, no 0x prefix). */
  privateKeyHex: string;
  /** Unix epoch seconds when the latest KEY_ADD was submitted. */
  registeredAtUnix: number;
  /** Sliding TTL in seconds that the latest KEY_ADD carried. */
  ttlSeconds: number;
  /** Custody address that signed the SignedKeyRequest. */
  custodyAddress: string;
  /** SignedKeyRequest deadline (unix seconds) — for diagnostics. */
  deadlineUnix: number;
}

export interface SignerStore {
  get(): Promise<SignerRecord | null>;
  save(record: SignerRecord): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Minimal opt-in state. The mobile app reads this to decide whether to
 * route writes through hypersnap or fall back directly to client.farcaster.xyz.
 */
export type HypersnapOptInChoice = 'opted-in' | 'opted-out' | 'unset';

export interface OptInStore {
  get(): Promise<HypersnapOptInChoice>;
  set(choice: HypersnapOptInChoice): Promise<void>;
}
