/**
 * WebSocket client interface
 *
 * Platform-agnostic WebSocket connection management.
 * Handles connection, reconnection, and message routing.
 *
 * IMPORTANT: This handles transport only. Encryption is handled separately
 * by the CryptoProvider before/after message transmission.
 */

// ============ Connection State ============

export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// ============ Message Types ============

/**
 * Encrypted message received from WebSocket
 * The content is a SealedMessage containing the encrypted envelope.
 * All cryptographic material (ephemeral key, identity key) comes from the envelope itself.
 */
export interface EncryptedWebSocketMessage {
  /** The encrypted message content (JSON string of SealedMessage) */
  encryptedContent: string;
  /** The inbox address this message was sent to */
  inboxAddress: string;
  /** Server timestamp */
  timestamp: number;
}

/**
 * SealedMessage format from the network
 * Contains an encrypted envelope that can be unsealed with device keys.
 * The ephemeral_public_key is used along with the inbox private key to decrypt.
 */
export interface SealedMessage {
  /** The inbox address the message was sent to */
  inbox_address: string;
  /** Sender's ephemeral public key (used for decryption) */
  ephemeral_public_key: string;
  /** The encrypted envelope (contains identity key, message, return inbox info) */
  envelope: string;
  /** Optional inbox public key for verification */
  inbox_public_key?: string;
  /** Optional inbox signature for verification */
  inbox_signature?: string;
}

/**
 * UnsealedEnvelope - the decrypted content of a SealedMessage
 * Contains all the data needed to establish a session and decrypt the message.
 */
export interface UnsealedEnvelope {
  /** Sender's user address */
  user_address: string;
  /** Sender's display name */
  display_name?: string;
  /** Sender's icon URL */
  user_icon?: string;
  /** Inbox address for sending replies */
  return_inbox_address: string;
  /** Encryption key for the return inbox */
  return_inbox_encryption_key: string;
  /** Public key for the return inbox */
  return_inbox_public_key: string;
  /** Private key for the return inbox (only for sender's own use) */
  return_inbox_private_key: string;
  /** Sender's identity public key (for X3DH) */
  identity_public_key: string;
  /** Session/conversation tag */
  tag: string;
  /** The encrypted/signed message content */
  message: string;
  /** Message type */
  type: string;
  /** The ephemeral public key used to seal this message */
  ephemeral_public_key: string;
}

/**
 * Outbound message to send via WebSocket
 */
export interface OutboundWebSocketMessage {
  /** Message type (e.g., 'message', 'listen', 'unlisten') */
  type: string;
  /** Message payload */
  payload: unknown;
}

/**
 * Listen/subscribe message for inbox addresses
 */
export interface ListenMessage {
  type: 'listen';
  inbox_addresses: string[];
}

/**
 * Unlisten/unsubscribe message
 */
export interface UnlistenMessage {
  type: 'unlisten';
  inbox_addresses: string[];
}

// ============ Configuration ============

export interface WebSocketClientOptions {
  /** WebSocket server URL */
  url: string;
  /** Interval between reconnection attempts (ms). Default: 1000 */
  reconnectInterval?: number;
  /** Maximum reconnection attempts. Default: Infinity */
  maxReconnectAttempts?: number;
  /** Queue processing interval (ms). Default: 1000 */
  queueProcessInterval?: number;
}

// ============ Event Handlers ============

export type MessageHandler = (message: EncryptedWebSocketMessage) => Promise<void>;
export type StateChangeHandler = (state: WebSocketConnectionState) => void;
export type ErrorHandler = (error: Error) => void;

// ============ WebSocket Client Interface ============

/**
 * WebSocketClient - Platform-agnostic WebSocket interface
 *
 * Features:
 * - Automatic reconnection with configurable interval
 * - Dual queue system (inbound/outbound)
 * - Inbox address subscription management
 * - Message handler registration
 *
 * Implementations:
 * - Browser/Electron: Uses native WebSocket API
 * - React Native: Uses React Native WebSocket
 */
export interface WebSocketClient {
  /**
   * Current connection state
   */
  readonly state: WebSocketConnectionState;

  /**
   * Whether currently connected
   */
  readonly isConnected: boolean;

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void;

  /**
   * Send a message (must be already serialized)
   * Messages are queued if not connected and sent when connection is established
   */
  send(message: string): Promise<void>;

  /**
   * Enqueue an outbound message with async preparation
   * Useful when message needs async work before sending
   */
  enqueueOutbound(prepareMessage: () => Promise<string[]>): void;

  /**
   * Subscribe to messages for inbox addresses
   */
  subscribe(inboxAddresses: string[]): Promise<void>;

  /**
   * Unsubscribe from inbox addresses
   */
  unsubscribe(inboxAddresses: string[]): Promise<void>;

  /**
   * Set the message handler for incoming messages
   * Only one handler can be set at a time
   */
  setMessageHandler(handler: MessageHandler): void;

  /**
   * Set the resubscribe callback (called after reconnection)
   */
  setResubscribeHandler(handler: () => Promise<void>): void;

  /**
   * Add a connection state change listener
   * @returns Unsubscribe function
   */
  onStateChange(handler: StateChangeHandler): () => void;

  /**
   * Add an error listener
   * @returns Unsubscribe function
   */
  onError(handler: ErrorHandler): () => void;
}

// ============ Factory Function Type ============

/**
 * Factory function to create a WebSocket client
 */
export type CreateWebSocketClient = (options: WebSocketClientOptions) => WebSocketClient;
