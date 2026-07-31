/**
 * Receipt reconciliation
 *
 * Decides what a receipt ack is allowed to write. Storage-agnostic and pure —
 * desktop (IndexedDB) and mobile (SQLite) keep their own walk mechanics and
 * call in for the decision, so the two platforms cannot drift on what a tick means.
 *
 * The invariant:
 *
 *   A message may be marked READ only if it was already confirmed DELIVERED.
 *   A read ack never manufactures a delivery.
 *
 * Read acks carry a high-water mark ("read up to timestamp Y"), so expanding
 * them into "everything at or below Y was delivered" marks lost messages as
 * delivered+read — the sender lies about messages that never landed. Delivery
 * acks carry real per-message IDs, so they are the source of truth.
 *
 * Ordering matters: the read debounce (5s) is shorter than the delivery
 * debounce (10s), so a read ack usually arrives BEFORE the delivery acks for
 * the same messages. Gating on `deliveredAt` alone would therefore drop the
 * upgrade. Instead the read ack advances a per-conversation watermark, and the
 * delivery ack completes the upgrade for anything at or below it. Whichever
 * ack lands second finishes the job.
 *
 * A read ack may also NAME the messages it read (`readMessageIds`). A named id
 * is self-proving — you cannot read what never arrived — so it settles ✓✓ on
 * the spot, including for a message whose delivery ack was lost. That does not
 * retire the watermark: naming is per-ack and dies with a dropped ack, while
 * the watermark is cumulative and so repairs one. They cover different
 * failures, and both are kept deliberately.
 */

/** Tolerated clock skew when validating an inbound read-ack timestamp. */
export const READ_ACK_MAX_CLOCK_SKEW_MS = 60_000;

/**
 * The fields reconciliation reads. Deliberately structural, not the full
 * `Message`, so callers can pass IndexedDB records or parsed SQLite payloads.
 */
export type ReceiptMessageView = {
  messageId: string;
  createdDate: number;
  deliveredAt?: number;
  readAt?: number;
};

/** Fields to write. Only ever contains what actually changes. */
export type ReceiptPatch = {
  deliveredAt?: number;
  readAt?: number;
};

export type ReadAckContext = {
  /** High-water mark message id from the ack — reading it proves it arrived. */
  upToMessageId: string;
  upToTimestamp: number;
  now: number;
  /**
   * Ids the peer explicitly named as read, when their build sends them. Each is
   * self-proving on the same grounds as the high-water mark, so this completes
   * ✓✓ for a message whose delivery ack was lost. Absent from older peers, in
   * which case only the high-water mark is self-proving, exactly as before.
   */
  readMessageIds?: ReadonlySet<string>;
};

export type DeliveryAckContext = {
  /** Newest read-ack timestamp seen for this conversation, or 0 if none. */
  readWatermark: number;
  now: number;
};

/**
 * Guard an inbound read-ack timestamp. Without this a peer sending
 * `Number.MAX_SAFE_INTEGER` would mark the sender's entire outbound history read.
 */
export function isReadAckTimestampValid(upToTimestamp: number, now: number): boolean {
  return (
    Number.isFinite(upToTimestamp) &&
    upToTimestamp > 0 &&
    upToTimestamp <= now + READ_ACK_MAX_CLOCK_SKEW_MS
  );
}

/**
 * What an incoming read ack may write to one of the sender's own messages.
 * Returns null when nothing changes. Caller must have validated the timestamp
 * and already filtered to own messages in the conversation.
 */
export function resolveReadAckPatch(
  msg: ReceiptMessageView,
  ctx: ReadAckContext,
): ReceiptPatch | null {
  // Named = the peer says it read THIS message, which proves it arrived. The
  // high-water mark always qualifies; newer peers also name the rest explicitly.
  const isNamed =
    msg.messageId === ctx.upToMessageId || ctx.readMessageIds?.has(msg.messageId) === true;
  const covered = msg.createdDate <= ctx.upToTimestamp && msg.deliveredAt !== undefined;

  // A named message is self-proving; everything else needs a real delivery ack.
  // Falling below the high-water timestamp is NOT proof — that inference is
  // what marked lost messages delivered before the truthfulness fix.
  if (!isNamed && !covered) return null;

  const patch: ReceiptPatch = {};
  if (msg.readAt === undefined) patch.readAt = ctx.now;
  if (isNamed && msg.deliveredAt === undefined) patch.deliveredAt = ctx.now;

  return patch.readAt === undefined && patch.deliveredAt === undefined ? null : patch;
}

/**
 * What an incoming delivery ack may write. Also completes a read upgrade when a
 * read ack for this range already arrived (the common out-of-order case).
 */
export function resolveDeliveryAckPatch(
  msg: ReceiptMessageView,
  ctx: DeliveryAckContext,
): ReceiptPatch | null {
  const patch: ReceiptPatch = {};
  if (msg.deliveredAt === undefined) patch.deliveredAt = ctx.now;
  if (msg.readAt === undefined && ctx.readWatermark > 0 && msg.createdDate <= ctx.readWatermark) {
    patch.readAt = ctx.now;
  }

  return patch.readAt === undefined && patch.deliveredAt === undefined ? null : patch;
}

/**
 * Rebuild a conversation's read watermark from stored messages, so it survives
 * a restart without a dedicated column: the newest own message carrying `readAt`.
 * Pass the sender's own messages for one conversation. Returns 0 when none.
 */
export function deriveReadWatermark(messages: readonly ReceiptMessageView[]): number {
  let watermark = 0;
  for (const msg of messages) {
    if (msg.readAt !== undefined && msg.createdDate > watermark) {
      watermark = msg.createdDate;
    }
  }
  return watermark;
}

/** Monotonic watermark advance — acks can arrive out of order. */
export function advanceReadWatermark(current: number, upToTimestamp: number): number {
  return upToTimestamp > current ? upToTimestamp : current;
}
