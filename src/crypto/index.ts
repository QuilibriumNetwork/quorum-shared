/**
 * Crypto module exports
 */

export type {
  // Key types
  Ed448Keypair,
  X448Keypair,
  Keypair,
  // Message types
  MessageCiphertext,
  P2PChannelEnvelope,
  // X3DH
  SenderX3DHParams,
  ReceiverX3DHParams,
  // Double ratchet
  NewDoubleRatchetParams,
  DoubleRatchetStateAndMessage,
  DoubleRatchetStateAndEnvelope,
  // Triple ratchet
  PeerInfo,
  NewTripleRatchetParams,
  TripleRatchetStateAndMetadata,
  TripleRatchetStateAndMessage,
  TripleRatchetStateAndEnvelope,
  // Initialization envelope
  InitializationEnvelope,
  // Inbox encryption
  InboxMessageEncryptRequest,
  InboxMessageDecryptRequest,
  // Provider interface
  CryptoProvider,
} from './types';

// Encryption state types and storage interface
export type {
  // Device and recipient types
  DeviceKeys,
  RecipientInfo,
  EncryptedEnvelope,
  // Storage types
  KeyValueStorageProvider,
  SendingInbox,
  ReceivingInbox,
  EncryptionState,
  InboxMapping,
  LatestState,
  ConversationInboxKeypair,
  EncryptionStateStorageInterface,
} from './encryption-state';
export { ENCRYPTION_STORAGE_KEYS } from './encryption-state';

// WASM implementation (for desktop/web)
export { WasmCryptoProvider } from './wasm-provider';
export type { ChannelWasmModule } from './wasm-provider';
