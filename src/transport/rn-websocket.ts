/**
 * React Native WebSocket client implementation
 *
 * Uses the React Native WebSocket API which is similar to the browser's.
 * Implements automatic reconnection, dual queue system, and subscription management.
 *
 * Note: This implementation is nearly identical to browser-websocket.ts
 * but kept separate to allow for React Native-specific optimizations if needed.
 */

import type {
  WebSocketClient,
  WebSocketClientOptions,
  WebSocketConnectionState,
  EncryptedWebSocketMessage,
  MessageHandler,
  StateChangeHandler,
  ErrorHandler,
} from './websocket';
import { logger } from '../utils/logger';

/**
 * RNWebSocketClient - WebSocket implementation for React Native
 *
 * Features:
 * - Automatic reconnection with configurable interval
 * - Dual queue system (inbound messages, outbound message generators)
 * - Inbox address subscription management
 * - Periodic queue processing
 */
export class RNWebSocketClient implements WebSocketClient {
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private queueProcessInterval: number;

  private ws: WebSocket | null = null;
  private _state: WebSocketConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  // Queue system
  private inboundQueue: EncryptedWebSocketMessage[] = [];
  private outboundQueue: Array<() => Promise<string[]>> = [];
  // Envelopes that have been produced by a prepareMessage callback
  // (ratchet state already advanced + persisted) but not yet successfully
  // delivered to the WS layer. Pending sends survive a transient
  // disconnect — without this buffer, an OPEN→CLOSING transition mid-drain
  // would silently drop the envelope after the ratchet had already moved
  // past it, leaving the recipient permanently missing that message.
  private pendingEnvelopes: string[] = [];
  private isProcessing = false;
  private processIntervalId: ReturnType<typeof setInterval> | null = null;

  // Handlers
  private messageHandler: MessageHandler | null = null;
  private resubscribeHandler: (() => Promise<void>) | null = null;
  private stateChangeHandlers: Set<StateChangeHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.reconnectInterval = options.reconnectInterval ?? 1000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity;
    this.queueProcessInterval = options.queueProcessInterval ?? 1000;
  }

  get state(): WebSocketConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === 'connected';
  }

  private setState(newState: WebSocketConnectionState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.stateChangeHandlers.forEach((handler) => {
        try {
          handler(newState);
        } catch (error) {
          console.error('Error in state change handler:', error);
        }
      });
    }
  }

  private emitError(error: Error): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (e) {
        console.error('Error in error handler:', e);
      }
    });
  }

  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this.shouldReconnect = true;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');

      try {
        // React Native uses the global WebSocket class
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.setState('connected');
          this.startQueueProcessing();

          // Call resubscribe handler to restore subscriptions
          if (this.resubscribeHandler) {
            this.resubscribeHandler().catch((error) => {
              console.error('Error in resubscribe handler:', error);
            });
          }

          // Process any pending outbound messages
          this.processQueues();
          resolve();
        };

        this.ws.onclose = () => {
          this.setState('disconnected');
          this.stopQueueProcessing();

          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.setState('reconnecting');
            setTimeout(() => this.doConnect(), this.reconnectInterval);
          }
        };

        this.ws.onerror = () => {
          const error = new Error('WebSocket error');
          this.emitError(error);
          reject(error);
        };

        this.ws.onmessage = (event: { data: string }) => {
          try {
            // Log raw message for debugging
            logger.debug('[WS-RN] Raw message received:', event.data?.substring(0, 200));

            // Some server messages might not be encrypted content (e.g., acks, pings)
            // Skip messages that don't look like JSON objects
            if (!event.data || !event.data.startsWith('{')) {
              logger.debug('[WS-RN] Ignoring non-JSON message');
              return;
            }

            const message = JSON.parse(event.data) as EncryptedWebSocketMessage;

            // Check for error responses from server
            if ((message as any).error) {
              logger.error('[WS-RN] Server error response:', (message as any).error);
              return;
            }

            // Only process messages that have the expected structure
            if (!message.inboxAddress && !message.encryptedContent) {
              logger.debug('[WS-RN] Ignoring message without expected fields:', Object.keys(message));
              return;
            }

            this.inboundQueue.push(message);
            this.processQueues();
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error, 'raw:', event.data?.substring(0, 100));
          }
        };
      } catch (error) {
        this.setState('disconnected');
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopQueueProcessing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
  }

  async send(message: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      // Queue the message for later
      this.outboundQueue.push(async () => [message]);
    }
  }

  enqueueOutbound(prepareMessage: () => Promise<string[]>): void {
    this.outboundQueue.push(prepareMessage);
    this.processQueues();
  }

  async subscribe(inboxAddresses: string[]): Promise<void> {
    const message = JSON.stringify({
      type: 'listen',
      inbox_addresses: inboxAddresses,
    });
    await this.send(message);
  }

  async unsubscribe(inboxAddresses: string[]): Promise<void> {
    const message = JSON.stringify({
      type: 'unlisten',
      inbox_addresses: inboxAddresses,
    });
    await this.send(message);
  }

  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
    this.processQueues();
  }

  setResubscribeHandler(handler: () => Promise<void>): void {
    this.resubscribeHandler = handler;
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  private startQueueProcessing(): void {
    if (this.processIntervalId === null) {
      this.processIntervalId = setInterval(() => {
        this.processQueues();
      }, this.queueProcessInterval);
    }
  }

  private stopQueueProcessing(): void {
    if (this.processIntervalId !== null) {
      clearInterval(this.processIntervalId);
      this.processIntervalId = null;
    }
  }

  private async processQueues(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Process inbound messages
      if (this.messageHandler) {
        // Group messages by inbox address for efficient processing
        const inboxMap = new Map<string, EncryptedWebSocketMessage[]>();

        while (this.inboundQueue.length > 0) {
          const message = this.inboundQueue.shift()!;
          const existing = inboxMap.get(message.inboxAddress) || [];
          existing.push(message);
          inboxMap.set(message.inboxAddress, existing);
        }

        // Process all inbox groups concurrently
        const promises: Promise<void>[] = [];

        for (const [_, messages] of inboxMap) {
          promises.push(
            (async () => {
              for (const message of messages) {
                try {
                  await this.messageHandler!(message);
                } catch (error) {
                  console.error('Error processing inbound message:', error);
                }
              }
            })()
          );
        }

        await Promise.allSettled(promises);
      }

      // Process outbound messages only if connected. Two-stage drain:
      //
      // 1. Flush pendingEnvelopes — these were produced by a previous
      //    prepareMessage call whose corresponding ws.send failed
      //    (transient disconnect after ratchet state already advanced).
      //    They must go out before any newly-prepared envelopes,
      //    otherwise the recipient sees messages out of ratchet order.
      //
      // 2. Drain outboundQueue. Each prepareMessage produces N envelopes;
      //    we re-check ws.readyState before EACH ws.send because the
      //    encrypt step can take 50–200ms and the socket can transition
      //    mid-drain. If a send fails (either by exception or because
      //    readyState slipped), the envelope goes back into
      //    pendingEnvelopes so the next processQueues pass retries it
      //    rather than silently losing it.
      if (this.ws?.readyState === WebSocket.OPEN) {
        while (this.pendingEnvelopes.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
          const m = this.pendingEnvelopes[0];
          try {
            this.ws.send(m);
            this.pendingEnvelopes.shift();
          } catch (error) {
            console.error('Error flushing pending envelope:', error);
            break;
          }
        }

        while (this.outboundQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
          const prepareMessage = this.outboundQueue.shift()!;
          let messages: string[] = [];
          try {
            messages = await prepareMessage();
          } catch (error) {
            console.error('Error processing outbound message:', error);
            continue;
          }
          for (const m of messages) {
            if (this.ws?.readyState !== WebSocket.OPEN) {
              this.pendingEnvelopes.push(m);
              continue;
            }
            try {
              this.ws.send(m);
            } catch (error) {
              console.error('Error sending outbound envelope:', error);
              this.pendingEnvelopes.push(m);
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

/**
 * Factory function to create a React Native WebSocket client
 */
export function createRNWebSocketClient(options: WebSocketClientOptions): WebSocketClient {
  return new RNWebSocketClient(options);
}
