import { describe, it, expect } from 'vitest';
import {
  READ_ACK_MAX_CLOCK_SKEW_MS,
  advanceReadWatermark,
  deriveReadWatermark,
  isReadAckTimestampValid,
  resolveDeliveryAckPatch,
  resolveReadAckPatch,
  type ReceiptMessageView,
} from './reconcile';

const NOW = 1_000_000;

function msg(over: Partial<ReceiptMessageView> & { messageId: string; createdDate: number }): ReceiptMessageView {
  return { ...over };
}

describe('isReadAckTimestampValid', () => {
  it('accepts a normal timestamp', () => {
    expect(isReadAckTimestampValid(NOW - 5_000, NOW)).toBe(true);
  });

  it('accepts a timestamp inside the clock-skew window', () => {
    expect(isReadAckTimestampValid(NOW + READ_ACK_MAX_CLOCK_SKEW_MS, NOW)).toBe(true);
  });

  it('rejects a timestamp beyond the clock-skew window', () => {
    expect(isReadAckTimestampValid(NOW + READ_ACK_MAX_CLOCK_SKEW_MS + 1, NOW)).toBe(false);
  });

  it('rejects a hostile far-future timestamp', () => {
    expect(isReadAckTimestampValid(Number.MAX_SAFE_INTEGER, NOW)).toBe(false);
  });

  it('rejects zero, negative, and non-finite values', () => {
    expect(isReadAckTimestampValid(0, NOW)).toBe(false);
    expect(isReadAckTimestampValid(-1, NOW)).toBe(false);
    expect(isReadAckTimestampValid(Number.NaN, NOW)).toBe(false);
    expect(isReadAckTimestampValid(Number.POSITIVE_INFINITY, NOW)).toBe(false);
  });
});

describe('resolveReadAckPatch', () => {
  const ctx = { upToMessageId: 'hwm', upToTimestamp: 500, now: NOW };

  it('leaves an undelivered message untouched — the core fix', () => {
    const lost = msg({ messageId: 'lost', createdDate: 400 });
    expect(resolveReadAckPatch(lost, ctx)).toBeNull();
  });

  it('marks a delivered in-range message as read, without touching deliveredAt', () => {
    const delivered = msg({ messageId: 'm1', createdDate: 400, deliveredAt: 900 });
    expect(resolveReadAckPatch(delivered, ctx)).toEqual({ readAt: NOW });
  });

  it('stamps both on the high-water-mark message — reading it proves delivery', () => {
    const hwm = msg({ messageId: 'hwm', createdDate: 500 });
    expect(resolveReadAckPatch(hwm, ctx)).toEqual({ readAt: NOW, deliveredAt: NOW });
  });

  it('does not re-stamp deliveredAt on an already-delivered HWM message', () => {
    const hwm = msg({ messageId: 'hwm', createdDate: 500, deliveredAt: 900 });
    expect(resolveReadAckPatch(hwm, ctx)).toEqual({ readAt: NOW });
  });

  it('honours the HWM message even if its timestamp sits outside the range', () => {
    const hwm = msg({ messageId: 'hwm', createdDate: 900 });
    expect(resolveReadAckPatch(hwm, ctx)).toEqual({ readAt: NOW, deliveredAt: NOW });
  });

  it('ignores a delivered message newer than the high-water mark', () => {
    const newer = msg({ messageId: 'm2', createdDate: 600, deliveredAt: 900 });
    expect(resolveReadAckPatch(newer, ctx)).toBeNull();
  });

  it('is idempotent for an already-read message', () => {
    const already = msg({ messageId: 'm1', createdDate: 400, deliveredAt: 900, readAt: 950 });
    expect(resolveReadAckPatch(already, ctx)).toBeNull();
  });

  it('reproduces the reported bug: lost messages stay blank while neighbours upgrade', () => {
    // Ten sent messages; #4 and #7 never landed, so they carry no deliveredAt.
    const conversation = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const lost = n === 4 || n === 7;
      return msg({ messageId: `m${n}`, createdDate: n * 100, deliveredAt: lost ? undefined : 900 });
    });
    const readAll = { upToMessageId: 'm10', upToTimestamp: 1000, now: NOW };

    const read = conversation.filter((m) => resolveReadAckPatch(m, readAll)?.readAt !== undefined);

    expect(read.map((m) => m.messageId)).toEqual(['m1', 'm2', 'm3', 'm5', 'm6', 'm8', 'm9', 'm10']);
    expect(read.map((m) => m.messageId)).not.toContain('m4');
    expect(read.map((m) => m.messageId)).not.toContain('m7');
  });
});

describe('resolveDeliveryAckPatch', () => {
  it('stamps deliveredAt when no read ack has arrived yet', () => {
    const m = msg({ messageId: 'm1', createdDate: 400 });
    expect(resolveDeliveryAckPatch(m, { readWatermark: 0, now: NOW })).toEqual({ deliveredAt: NOW });
  });

  it('completes the upgrade when a read ack already covered this message', () => {
    // The common out-of-order case: read debounce (5s) beats delivery debounce (10s).
    const m = msg({ messageId: 'm1', createdDate: 400 });
    expect(resolveDeliveryAckPatch(m, { readWatermark: 500, now: NOW })).toEqual({
      deliveredAt: NOW,
      readAt: NOW,
    });
  });

  it('does not mark read when the message is newer than the watermark', () => {
    const m = msg({ messageId: 'm2', createdDate: 600 });
    expect(resolveDeliveryAckPatch(m, { readWatermark: 500, now: NOW })).toEqual({ deliveredAt: NOW });
  });

  it('is idempotent once delivered and read', () => {
    const m = msg({ messageId: 'm1', createdDate: 400, deliveredAt: 900, readAt: 950 });
    expect(resolveDeliveryAckPatch(m, { readWatermark: 500, now: NOW })).toBeNull();
  });

  it('adds only readAt when delivery was already recorded', () => {
    const m = msg({ messageId: 'm1', createdDate: 400, deliveredAt: 900 });
    expect(resolveDeliveryAckPatch(m, { readWatermark: 500, now: NOW })).toEqual({ readAt: NOW });
  });
});

describe('read-ack / delivery-ack ordering', () => {
  // Both orders must converge on delivered + read.
  const readCtx = { upToMessageId: 'hwm', upToTimestamp: 500, now: NOW };

  it('converges when the read ack arrives first', () => {
    const m = msg({ messageId: 'm1', createdDate: 400 });

    expect(resolveReadAckPatch(m, readCtx)).toBeNull(); // nothing to write yet
    const watermark = advanceReadWatermark(0, readCtx.upToTimestamp);

    expect(resolveDeliveryAckPatch(m, { readWatermark: watermark, now: NOW })).toEqual({
      deliveredAt: NOW,
      readAt: NOW,
    });
  });

  it('converges when the delivery ack arrives first', () => {
    const m = msg({ messageId: 'm1', createdDate: 400 });

    const delivery = resolveDeliveryAckPatch(m, { readWatermark: 0, now: NOW });
    expect(delivery).toEqual({ deliveredAt: NOW });

    const delivered = { ...m, ...delivery };
    expect(resolveReadAckPatch(delivered, readCtx)).toEqual({ readAt: NOW });
  });

  it('leaves a lost message blank in both orders', () => {
    const lost = msg({ messageId: 'lost', createdDate: 400 });
    const watermark = advanceReadWatermark(0, readCtx.upToTimestamp);

    // No delivery ack ever arrives for it, so nothing may write readAt.
    expect(resolveReadAckPatch(lost, readCtx)).toBeNull();
    expect(resolveReadAckPatch(lost, { ...readCtx, upToTimestamp: watermark })).toBeNull();
  });
});

describe('deriveReadWatermark', () => {
  it('returns 0 when nothing has been read', () => {
    expect(deriveReadWatermark([msg({ messageId: 'm1', createdDate: 400, deliveredAt: 900 })])).toBe(0);
  });

  it('returns the newest read message timestamp', () => {
    const messages = [
      msg({ messageId: 'm1', createdDate: 100, deliveredAt: 900, readAt: 950 }),
      msg({ messageId: 'm2', createdDate: 300, deliveredAt: 900, readAt: 950 }),
      msg({ messageId: 'm3', createdDate: 500, deliveredAt: 900 }),
    ];
    expect(deriveReadWatermark(messages)).toBe(300);
  });

  it('ignores order', () => {
    const messages = [
      msg({ messageId: 'm2', createdDate: 300, readAt: 950 }),
      msg({ messageId: 'm1', createdDate: 100, readAt: 950 }),
    ];
    expect(deriveReadWatermark(messages)).toBe(300);
  });

  it('handles an empty conversation', () => {
    expect(deriveReadWatermark([])).toBe(0);
  });
});

describe('advanceReadWatermark', () => {
  it('advances forward', () => {
    expect(advanceReadWatermark(300, 500)).toBe(500);
  });

  it('never moves backward on an out-of-order ack', () => {
    expect(advanceReadWatermark(500, 300)).toBe(500);
  });

  it('is stable for a repeat ack', () => {
    expect(advanceReadWatermark(500, 500)).toBe(500);
  });
});
