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

// Browser/Electron WebSocket implementation
export { BrowserWebSocketClient, createBrowserWebSocketClient } from './browser-websocket';

// React Native WebSocket implementation
export { RNWebSocketClient, createRNWebSocketClient } from './rn-websocket';
