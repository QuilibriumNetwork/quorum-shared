/**
 * ReceiptService
 *
 * Manages the ack buffer for delivery receipts and read receipts. Coordinates:
 * - Buffering messageIds when DMs are decrypted (delivery acks)
 * - Tracking read high-water mark + the ids read since last flush, per address
 * - Piggybacking acks on outgoing DMs
 * - Timer-based standalone ack flush (10s delivery, 5s read)
 * - Flush-all on app backgrounding
 *
 * Platform-agnostic: the constructor takes callbacks for the platform-specific
 * pieces (encrypted send, React Query cache updates, etc.). DOM access for the
 * background-flush listener is guarded with `typeof document` / `typeof window`
 * checks so the same code runs unchanged on React Native, where the listener
 * is simply skipped and the caller wires their own foreground-change signal.
 */

const DELIVERY_FLUSH_TIMEOUT_MS = 10_000;
const READ_FLUSH_TIMEOUT_MS = 5_000;

type ReadHighWaterMark = { messageId: string; timestamp: number };

/**
 * What one read flush carries: the cumulative high-water mark, plus the ids
 * read since the last flush. The mark repairs a dropped ack; the ids prove
 * arrival for the messages they name. See reconcile.ts for why both exist.
 */
export type ReadFlushPayload = ReadHighWaterMark & { messageIds: string[] };

export interface ReceiptServiceOptions {
  /** Called when delivery ack buffer needs to be flushed */
  onFlush: (address: string, messageIds: string[]) => void;
  /** Called when incoming delivery acks are received */
  onAckProcessed?: (messageIds: string[]) => void;
  /** Called when a read ack needs to be flushed (high-water mark + named ids) */
  onReadFlush?: (address: string, payload: ReadFlushPayload) => void;
  /**
   * Called when incoming read acks are received. conversationAddress is the DM
   * partner's address. `messageIds` is absent when the peer's build predates it.
   */
  onReadAckProcessed?: (
    upToMessageId: string,
    upToTimestamp: number,
    conversationAddress: string,
    messageIds?: string[],
  ) => void;
}

export class ReceiptService {
  private buffers = new Map<string, Set<string>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readHighWaterMarks = new Map<string, ReadHighWaterMark>();
  private readMessageIds = new Map<string, Set<string>>();
  private readTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private options: ReceiptServiceOptions;
  private visibilityHandler: (() => void) | null = null;

  constructor(options: ReceiptServiceOptions) {
    this.options = options;
    this.setupVisibilityListener();
  }

  // === Delivery Ack Methods (unchanged) ===

  onMessageReceived(address: string, messageId: string): void {
    let buffer = this.buffers.get(address);
    if (!buffer) {
      buffer = new Set();
      this.buffers.set(address, buffer);
    }
    buffer.add(messageId);
    this.resetDeliveryTimer(address);
  }

  flushForPiggyback(address: string): string[] {
    const buffer = this.buffers.get(address);
    if (!buffer || buffer.size === 0) return [];

    const ids = Array.from(buffer);
    this.clearDeliveryAddress(address);
    return ids;
  }

  onAckReceived(messageIds: string[]): void {
    if (messageIds.length > 0 && this.options.onAckProcessed) {
      this.options.onAckProcessed(messageIds);
    }
  }

  // === Read Ack Methods ===

  /**
   * Record that a message was read. Buffers its id and advances the high-water
   * mark when the timestamp is higher.
   * Caller must check readReceipts setting BEFORE calling this.
   */
  onMessageRead(address: string, messageId: string, timestamp: number): void {
    // Buffer the id unconditionally. Reading an older message out of order still
    // proves that message arrived, so it belongs in the set even though it
    // cannot advance the mark.
    let ids = this.readMessageIds.get(address);
    if (!ids) {
      ids = new Set();
      this.readMessageIds.set(address, ids);
    }
    ids.add(messageId);

    const existing = this.readHighWaterMarks.get(address);
    // A mark is only ever set together with a timer, and cleared together with
    // it, so an existing mark guarantees a flush is already scheduled for the id
    // just buffered. Returning here therefore strands nothing.
    if (existing && existing.timestamp >= timestamp) return;

    this.readHighWaterMarks.set(address, { messageId, timestamp });
    this.resetReadTimer(address);
  }

  flushReadForPiggyback(address: string): ReadFlushPayload | null {
    const payload = this.buildReadPayload(address);
    if (!payload) return null;

    this.clearReadAddress(address);
    return payload;
  }

  onReadAckReceived(
    upToMessageId: string,
    upToTimestamp: number,
    conversationAddress: string,
    messageIds?: string[],
  ): void {
    if (this.options.onReadAckProcessed) {
      this.options.onReadAckProcessed(upToMessageId, upToTimestamp, conversationAddress, messageIds);
    }
  }

  clearReadBuffer(): void {
    for (const timer of this.readTimers.values()) {
      clearTimeout(timer);
    }
    this.readHighWaterMarks.clear();
    this.readMessageIds.clear();
    this.readTimers.clear();
  }

  // === Shared Methods ===

  flushAll(): void {
    for (const [address, buffer] of this.buffers) {
      if (buffer.size > 0) {
        this.options.onFlush(address, Array.from(buffer));
      }
    }
    if (this.options.onReadFlush) {
      for (const address of this.readHighWaterMarks.keys()) {
        const payload = this.buildReadPayload(address);
        if (payload) this.options.onReadFlush(address, payload);
      }
    }
    this.clearAll();
  }

  destroy(): void {
    this.clearAll();
    if (this.visibilityHandler) {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', this.visibilityHandler);
      }
    }
  }

  // === Private ===

  private resetDeliveryTimer(address: string): void {
    const existing = this.timers.get(address);
    if (existing) clearTimeout(existing);

    this.timers.set(
      address,
      setTimeout(() => {
        const buffer = this.buffers.get(address);
        if (buffer && buffer.size > 0) {
          this.options.onFlush(address, Array.from(buffer));
          this.clearDeliveryAddress(address);
        }
      }, DELIVERY_FLUSH_TIMEOUT_MS),
    );
  }

  /** The mark plus the ids read since the last flush. Null when nothing pending. */
  private buildReadPayload(address: string): ReadFlushPayload | null {
    const hwm = this.readHighWaterMarks.get(address);
    if (!hwm) return null;

    return { ...hwm, messageIds: Array.from(this.readMessageIds.get(address) ?? []) };
  }

  private resetReadTimer(address: string): void {
    const existing = this.readTimers.get(address);
    if (existing) clearTimeout(existing);

    this.readTimers.set(
      address,
      setTimeout(() => {
        const payload = this.buildReadPayload(address);
        if (payload && this.options.onReadFlush) {
          this.options.onReadFlush(address, payload);
          this.clearReadAddress(address);
        }
      }, READ_FLUSH_TIMEOUT_MS),
    );
  }

  private clearDeliveryAddress(address: string): void {
    this.buffers.delete(address);
    const timer = this.timers.get(address);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(address);
    }
  }

  private clearReadAddress(address: string): void {
    this.readHighWaterMarks.delete(address);
    this.readMessageIds.delete(address);
    const timer = this.readTimers.get(address);
    if (timer) {
      clearTimeout(timer);
      this.readTimers.delete(address);
    }
  }

  private clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.buffers.clear();
    this.timers.clear();
    for (const timer of this.readTimers.values()) {
      clearTimeout(timer);
    }
    this.readHighWaterMarks.clear();
    this.readMessageIds.clear();
    this.readTimers.clear();
  }

  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.flushAll();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.visibilityHandler);
    }
  }
}
