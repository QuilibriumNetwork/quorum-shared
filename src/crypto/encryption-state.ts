/**
 * Encryption State Types and Storage Interface
 *
 * Platform-agnostic types for managing Double Ratchet encryption states.
 * The actual storage implementation is platform-specific (MMKV for mobile, IndexedDB for desktop).
 */

// ============ Device & Recipient Types ============

/**
 * DeviceKeys - Device's cryptographic keypairs for E2E encryption
 * Used for X3DH key exchange and inbox message unsealing
 */
export interface DeviceKeys {
  /** X448 identity key for X3DH - private key */
  identityPrivateKey: number[];
  /** X448 identity key for X3DH - public key */
  identityPublicKey: number[];
  /** X448 signed pre-key for X3DH - private key */
  preKeyPrivateKey: number[];
  /** X448 signed pre-key for X3DH - public key */
  preKeyPublicKey: number[];
  /** X448 inbox encryption key for unsealing - private key */
  inboxEncryptionPrivateKey: number[];
  /** X448 inbox encryption key for unsealing - public key */
  inboxEncryptionPublicKey: number[];
}

/**
 * RecipientInfo - Recipient's public keys needed for encryption
 * Used to establish X3DH session and seal messages
 */
export interface RecipientInfo {
  /** Recipient's address */
  address: string;
  /** X448 identity public key for X3DH */
  identityKey: number[];
  /** X448 signed pre-key for X3DH */
  signedPreKey: number[];
  /** Recipient's inbox address */
  inboxAddress: string;
  /** X448 public key for sealing envelopes to recipient's inbox */
  inboxEncryptionKey?: number[];
}

/**
 * EncryptedEnvelope - Result of encrypting a message
 */
export interface EncryptedEnvelope {
  /** The encrypted Double Ratchet envelope */
  envelope: string;
  /** Recipient's inbox address */
  inboxAddress: string;
  /** Ephemeral public key (only set for first message in new session) */
  ephemeralPublicKey?: number[];
  /** Ephemeral private key (only set for first message - needed for sealing) */
  ephemeralPrivateKey?: number[];
}

// ============ Storage Provider Interface ============

/**
 * KeyValueStorageProvider - Platform-agnostic key-value storage interface
 *
 * Implementations:
 * - MMKV (React Native)
 * - IndexedDB (Desktop/Web)
 * - AsyncStorage (React Native fallback)
 */
export interface KeyValueStorageProvider {
  /**
   * Get a string value by key
   * @returns The value or null if not found
   */
  getString(key: string): string | null;

  /**
   * Set a string value
   */
  set(key: string, value: string): void;

  /**
   * Remove a key
   */
  remove(key: string): void;

  /**
   * Get all keys in storage
   */
  getAllKeys(): string[];

  /**
   * Clear all data from storage
   */
  clearAll(): void;
}

// ============ Inbox Types ============

/**
 * SendingInbox - Recipient's inbox info needed for sealing messages
 * Matches desktop SDK's SendingInbox type
 */
export interface SendingInbox {
  /** Recipient's inbox address where we send to */
  inbox_address: string;
  /** Recipient's X448 public key for sealing (hex) */
  inbox_encryption_key: string;
  /** Recipient's Ed448 public key (hex) - empty until confirmed */
  inbox_public_key: string;
  /** Always empty - we don't have their private key */
  inbox_private_key: string;
}

/**
 * ReceivingInbox - Our inbox info for receiving replies
 * Simplified version (full keypair stored separately in ConversationInboxKeypair)
 */
export interface ReceivingInbox {
  /** Our inbox address where we receive replies */
  inbox_address: string;
}

// ============ Encryption State ============

/**
 * EncryptionState - Double Ratchet state for a conversation+inbox pair
 * Matches desktop's DoubleRatchetStateAndInboxKeys structure
 */
export interface EncryptionState {
  /** JSON-serialized ratchet state */
  state: string;
  /** When state was created/updated */
  timestamp: number;
  /** Conversation identifier */
  conversationId: string;
  /** Associated inbox ID (our receiving inbox) */
  inboxId: string;
  /** Whether we've sent an accept message */
  sentAccept?: boolean;
  /** Recipient's inbox info for sealing messages */
  sendingInbox?: SendingInbox;
  /** Session tag (usually our inbox address) */
  tag?: string;
  /**
   * X3DH ephemeral public key (hex) used for session establishment.
   * MUST be reused for all init envelopes until session is confirmed.
   * This ensures the receiver can derive the same session key via X3DH.
   */
  x3dhEphemeralPublicKey?: string;
  /**
   * X3DH ephemeral private key (hex) used for session establishment.
   * MUST be reused for sealing init envelopes until session is confirmed.
   */
  x3dhEphemeralPrivateKey?: string;
}

// ============ Inbox Mapping ============

/**
 * InboxMapping - Maps inbox address to conversation
 */
export interface InboxMapping {
  inboxId: string;
  conversationId: string;
}

/**
 * LatestState - Tracks the most recent state for a conversation
 */
export interface LatestState {
  conversationId: string;
  inboxId: string;
  timestamp: number;
}

// ============ Conversation Inbox Keypair ============

/**
 * ConversationInboxKeypair - Per-conversation inbox keypair for receiving replies
 * Mirrors desktop's InboxKeyset structure with both Ed448 and X448 keys
 */
export interface ConversationInboxKeypair {
  conversationId: string;
  inboxAddress: string;
  /** X448 encryption public key (for sealing/unsealing messages) */
  encryptionPublicKey: number[];
  /** X448 encryption private key */
  encryptionPrivateKey: number[];
  /** Ed448 signing public key (for signing/verifying inbox messages) */
  signingPublicKey?: number[];
  /** Ed448 signing private key */
  signingPrivateKey?: number[];
}

// ============ Storage Key Prefixes ============

/**
 * Storage key prefixes for encryption state data
 */
export const ENCRYPTION_STORAGE_KEYS = {
  /** enc_state:{conversationId}:{inboxId} */
  ENCRYPTION_STATE: 'enc_state:',
  /** inbox_map:{inboxId} */
  INBOX_MAPPING: 'inbox_map:',
  /** latest:{conversationId} */
  LATEST_STATE: 'latest:',
  /** conv_inboxes:{conversationId} -> inboxId[] */
  CONVERSATION_INBOXES: 'conv_inboxes:',
  /** conv_inbox_key:{conversationId} -> ConversationInboxKeypair */
  CONVERSATION_INBOX_KEY: 'conv_inbox_key:',
} as const;

// ============ Encryption State Storage Interface ============

/**
 * EncryptionStateStorageInterface - Interface for managing encryption states
 *
 * This interface defines the contract for encryption state storage.
 * Implementations use platform-specific storage backends.
 */
export interface EncryptionStateStorageInterface {
  // Encryption States
  getEncryptionState(conversationId: string, inboxId: string): EncryptionState | null;
  getEncryptionStates(conversationId: string): EncryptionState[];
  saveEncryptionState(state: EncryptionState, updateLatest?: boolean): void;
  deleteEncryptionState(conversationId: string, inboxId: string): void;
  deleteAllEncryptionStates(conversationId: string): void;

  // Inbox Mapping
  getInboxMapping(inboxId: string): InboxMapping | null;
  saveInboxMapping(inboxId: string, conversationId: string): void;
  deleteInboxMapping(inboxId: string): void;

  // Latest State
  getLatestState(conversationId: string): LatestState | null;

  // Conversation Inbox Keypairs
  saveConversationInboxKeypair(keypair: ConversationInboxKeypair): void;
  getConversationInboxKeypair(conversationId: string): ConversationInboxKeypair | null;
  deleteConversationInboxKeypair(conversationId: string): void;
  getConversationInboxKeypairByAddress(inboxAddress: string): ConversationInboxKeypair | null;
  getAllConversationInboxAddresses(): string[];

  // Utilities
  clearAll(): void;
  hasEncryptionState(conversationId: string): boolean;
  getStatesByInboxId(inboxId: string): Array<{ conversationId: string; state: EncryptionState }>;
}
