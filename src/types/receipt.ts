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
 */
export type ReadAckMessage = {
  senderId: string;
  type: 'read-ack';
  upToMessageId: string;
  upToTimestamp: number;
};

/**
 * Envelope-level fields for piggybacking receipt data on outgoing DMs.
 * These ride along with regular messages and are stripped before persistence.
 */
export type ReceiptEnvelopeFields = {
  /** Piggybacked delivery ack message IDs (stripped before persistence) */
  ackMessageIds?: string[];
  /** Piggybacked read ack high-water mark (stripped before persistence) */
  readAckUpTo?: { messageId: string; timestamp: number };
};
