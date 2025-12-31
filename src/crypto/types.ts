/**
 * Crypto types and CryptoProvider interface
 *
 * Platform-agnostic cryptographic operations for E2E encryption.
 * Implementations:
 * - WASM (desktop/web): Uses channel-wasm bindings
 * - Native (iOS/Android): Uses uniffi-generated bindings
 */

// ============ Key Types ============

export interface Ed448Keypair {
  type: 'ed448';
  public_key: number[];
  private_key: number[];
}

export interface X448Keypair {
  type: 'x448';
  public_key: number[];
  private_key: number[];
}

export type Keypair = Ed448Keypair | X448Keypair;

// ============ Message Ciphertext ============

export interface MessageCiphertext {
  ciphertext: string;
  initialization_vector: string;
  associated_data?: string;
}

export interface P2PChannelEnvelope {
  protocol_identifier: number;
  message_header: MessageCiphertext;
  message_body: MessageCiphertext;
}

// ============ X3DH Key Agreement ============

export interface SenderX3DHParams {
  sending_identity_private_key: number[];
  sending_ephemeral_private_key: number[];
  receiving_identity_key: number[];
  receiving_signed_pre_key: number[];
  session_key_length: number;
}

export interface ReceiverX3DHParams {
  sending_identity_private_key: number[];
  sending_signed_private_key: number[];
  receiving_identity_key: number[];
  receiving_ephemeral_key: number[];
  session_key_length: number;
}

// ============ Double Ratchet ============

export interface NewDoubleRatchetParams {
  session_key: number[];
  sending_header_key: number[];
  next_receiving_header_key: number[];
  is_sender: boolean;
  sending_ephemeral_private_key: number[];
  receiving_ephemeral_key: number[];
}

export interface DoubleRatchetStateAndMessage {
  ratchet_state: string;
  message: number[];
}

export interface DoubleRatchetStateAndEnvelope {
  ratchet_state: string;
  envelope: string;
}

// ============ Triple Ratchet ============

export interface PeerInfo {
  public_key: number[];
  identity_public_key: number[];
  signed_pre_public_key: number[];
}

export interface NewTripleRatchetParams {
  peers: number[][];
  peer_key: number[];
  identity_key: number[];
  signed_pre_key: number[];
  threshold: number;
  async_dkg_ratchet: boolean;
}

export interface TripleRatchetStateAndMetadata {
  ratchet_state: string;
  metadata: Record<string, string>;
}

export interface TripleRatchetStateAndMessage {
  ratchet_state: string;
  message: number[];
}

export interface TripleRatchetStateAndEnvelope {
  ratchet_state: string;
  envelope: string;
}

// ============ Initialization Envelope ============

/**
 * InitializationEnvelope - Contains sender info for first message in a session
 *
 * This is the format BEFORE sealing. The ephemeral_public_key is NOT included here -
 * it goes at the TOP LEVEL of the SealedMessage, and the SAME ephemeral key is used for both:
 * 1. Sealing the envelope (inbox encryption)
 * 2. X3DH session establishment
 *
 * After unsealing, the ephemeral_public_key is added back to create UnsealedEnvelope
 * (see transport/websocket.ts)
 */
export interface InitializationEnvelope {
  /** Sender's user address */
  user_address: string;
  /** Sender's display name */
  display_name?: string;
  /** Sender's icon URL */
  user_icon?: string;
  /** Inbox address for sending replies */
  return_inbox_address: string;
  /** X448 encryption key for the return inbox (hex) */
  return_inbox_encryption_key: string;
  /** Ed448 public key for the return inbox (hex) */
  return_inbox_public_key: string;
  /** Ed448 private key for the return inbox (hex) - shared so recipient can sign replies */
  return_inbox_private_key: string;
  /** Sender's identity public key for X3DH (hex) */
  identity_public_key: string;
  /** Session/conversation tag (typically the return inbox address) */
  tag: string;
  /** The Double Ratchet encrypted message envelope */
  message: string;
  /** Message type (e.g., 'direct') */
  type: string;
}

// ============ Inbox Message Encryption ============

export interface InboxMessageEncryptRequest {
  inbox_public_key: number[];
  ephemeral_private_key: number[];
  plaintext: number[];
}

export interface InboxMessageDecryptRequest {
  inbox_private_key: number[];
  ephemeral_public_key: number[];
  ciphertext: MessageCiphertext;
}

// ============ CryptoProvider Interface ============

/**
 * CryptoProvider - Platform-agnostic interface for cryptographic operations
 *
 * This interface abstracts the underlying crypto implementation,
 * allowing the same code to work with WASM (desktop) or native modules (mobile).
 *
 * All methods are async to support both synchronous WASM and async native bridges.
 * State is serialized as JSON strings for cross-platform compatibility.
 */
export interface CryptoProvider {
  // ============ Key Generation ============

  /**
   * Generate an X448 keypair for encryption
   */
  generateX448(): Promise<X448Keypair>;

  /**
   * Generate an Ed448 keypair for signing
   */
  generateEd448(): Promise<Ed448Keypair>;

  /**
   * Derive public key from X448 private key
   * @param privateKey Base64-encoded private key
   * @returns Base64-encoded public key
   */
  getPublicKeyX448(privateKey: string): Promise<string>;

  /**
   * Derive public key from Ed448 private key
   * @param privateKey Base64-encoded private key
   * @returns Base64-encoded public key
   */
  getPublicKeyEd448(privateKey: string): Promise<string>;

  // ============ X3DH Key Agreement ============

  /**
   * Perform sender-side X3DH key agreement
   * @returns Base64-encoded session key (96 bytes: 32 session + 32 sending header + 32 receiving header)
   */
  senderX3DH(params: SenderX3DHParams): Promise<string>;

  /**
   * Perform receiver-side X3DH key agreement
   * @returns Base64-encoded session key (96 bytes)
   */
  receiverX3DH(params: ReceiverX3DHParams): Promise<string>;

  // ============ Double Ratchet ============

  /**
   * Initialize a new double ratchet session
   * @returns JSON-serialized ratchet state
   */
  newDoubleRatchet(params: NewDoubleRatchetParams): Promise<string>;

  /**
   * Encrypt a message using double ratchet
   * @returns Updated state and encrypted envelope
   */
  doubleRatchetEncrypt(
    stateAndMessage: DoubleRatchetStateAndMessage
  ): Promise<DoubleRatchetStateAndEnvelope>;

  /**
   * Decrypt a message using double ratchet
   * @returns Updated state and decrypted message
   */
  doubleRatchetDecrypt(
    stateAndEnvelope: DoubleRatchetStateAndEnvelope
  ): Promise<DoubleRatchetStateAndMessage>;

  // ============ Triple Ratchet ============

  /**
   * Initialize a new triple ratchet session for group messaging
   * @returns Initial state and DKG metadata
   */
  newTripleRatchet(params: NewTripleRatchetParams): Promise<TripleRatchetStateAndMetadata>;

  /**
   * Triple ratchet DKG round 1 - Generate polynomial fragments
   */
  tripleRatchetInitRound1(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata>;

  /**
   * Triple ratchet DKG round 2 - Receive fragments, compute ZK commitment
   */
  tripleRatchetInitRound2(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata>;

  /**
   * Triple ratchet DKG round 3 - Receive commitments, compute ZK reveal
   */
  tripleRatchetInitRound3(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata>;

  /**
   * Triple ratchet DKG round 4 - Verify proofs, reconstruct group key
   */
  tripleRatchetInitRound4(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata>;

  /**
   * Encrypt a message for the group using triple ratchet
   */
  tripleRatchetEncrypt(
    stateAndMessage: TripleRatchetStateAndMessage
  ): Promise<TripleRatchetStateAndEnvelope>;

  /**
   * Decrypt a group message using triple ratchet
   */
  tripleRatchetDecrypt(
    stateAndEnvelope: TripleRatchetStateAndEnvelope
  ): Promise<TripleRatchetStateAndMessage>;

  /**
   * Handle group membership changes
   */
  tripleRatchetResize(state: TripleRatchetStateAndMetadata): Promise<TripleRatchetStateAndMetadata>;

  // ============ Inbox Message Encryption ============

  /**
   * Encrypt a message for an inbox (sealed sender / ECIES-style)
   * @returns Base64-encoded sealed message
   */
  encryptInboxMessage(request: InboxMessageEncryptRequest): Promise<string>;

  /**
   * Decrypt a sealed inbox message
   * @returns Decrypted plaintext as byte array
   */
  decryptInboxMessage(request: InboxMessageDecryptRequest): Promise<number[]>;
}
