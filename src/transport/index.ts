/**
 * Transport module exports
 */

// HTTP transport types
export type {
  TransportConfig,
  TransportRequestOptions,
  TransportResponse,
  TransportClient,
} from './types';

// WebSocket types
export type {
  WebSocketConnectionState,
  EncryptedWebSocketMessage,
  SealedMessage,
  UnsealedEnvelope,
  OutboundWebSocketMessage,
  ListenMessage,
  UnlistenMessage,
  WebSocketClientOptions,
  MessageHandler,
  StateChangeHandler,
  ErrorHandler,
  WebSocketClient,
  CreateWebSocketClient,
} from './websocket';

// Send-side durability policy shared by both WebSocket implementations
export {
  SendRetention,
  DEFAULT_SEND_RETENTION_MS,
  DEFAULT_SEND_RETENTION_FRAMES,
} from './send-retention';
export type {
  SendRetentionOptions,
  SendRetentionReplay,
  SendRetentionDropCauses,
} from './send-retention';

// Browser/Electron WebSocket implementation
export { BrowserWebSocketClient, createBrowserWebSocketClient } from './browser-websocket';

// React Native WebSocket implementation
export { RNWebSocketClient, createRNWebSocketClient } from './rn-websocket';
