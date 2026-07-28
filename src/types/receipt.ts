/**
 * Delivery & Read Receipt Types
 *
 * Control messages for the DM receipt protocol. These are NOT part of the
 * MessageContent union — they are intercepted at the decrypt layer before
 * the saveMessage/addMessage pipeline.
 *
 * Envelope-level fields (ackMessageIds, readAckUpTo) are attached to outgoing
 * DMs for piggybacking and stripped before persistence.
 */

/**
 * Delivery ack control message — confirms recipient's device decrypted the DM.
 * Batches multiple message IDs in a single ack.
 */
export type DeliveryAckMessage = {
  senderId: string;
  type: 'delivery-ack';
  messageIds: string[];
};

/**
 * Read ack control message — confirms recipient visually saw the DM.
 * Uses a high-water mark: "read up to this message/timestamp".
 *
 * `messageIds` additionally names the messages read since the last flush.
 * Naming a message proves it arrived (you cannot read what you never got), so
 * each named id is self-proving exactly as the high-water-mark message already
 * is — which lets a read ack complete ✓✓ even when that message's delivery ack
 * was lost. The high-water mark is NOT superseded by it: the mark is cumulative
 * (every ack restates the whole read history) and so heals a dropped read ack,
 * where a set names each message once and is gone if that ack is lost.
 *
 * Optional on purpose. A peer running an older build ignores the field and
 * behaves exactly as before — nothing is drained or destroyed to populate it.
 */
export type ReadAckMessage = {
  senderId: string;
  type: 'read-ack';
  upToMessageId: string;
  upToTimestamp: number;
  messageIds?: string[];
};

/**
 * Discriminated union of all standalone receipt control messages.
 * Use this to narrow `raw.type` inside the decrypt-layer intercept.
 */
export type ReceiptControlMessage = DeliveryAckMessage | ReadAckMessage;

/** String-literal discriminator for ReceiptControlMessage. */
export type ReceiptControlMessageType = ReceiptControlMessage['type'];

/**
 * Envelope-level fields for piggybacking receipt data on outgoing DMs.
 * These ride along with regular messages and are stripped before persistence.
 */
export type ReceiptEnvelopeFields = {
  /** Piggybacked delivery ack message IDs (stripped before persistence) */
  ackMessageIds?: string[];
  /**
   * Piggybacked read ack high-water mark (stripped before persistence).
   * `messageIds` mirrors ReadAckMessage.messageIds so the piggyback path proves
   * delivery for the same messages a standalone read ack would.
   */
  readAckUpTo?: { messageId: string; timestamp: number; messageIds?: string[] };
};
