import { describe, it, expect } from 'vitest';
import { SendRetention } from './send-retention';

// A frame's age is measured from send to socket CLOSE, so these tests drive the
// clock explicitly: `t` is a plain millisecond counter, not a real timestamp.
const opts = { maxAgeMs: 10_000, maxFrames: 5 };

describe('SendRetention', () => {
  it('replays retained frames in send order after a close', () => {
    const r = new SendRetention(opts);

    r.retain('a', 1000);
    r.retain('b', 1100);
    r.retain('c', 1200);
    r.sealOnClose(1300);

    expect(r.takeForReplay(1400).frames).toEqual(['a', 'b', 'c']);
  });

  it('drops frames sent more than maxAgeMs before the socket died', () => {
    const r = new SendRetention(opts);

    r.retain('old', 1000); // 11s before the close — the relay was still acking
    r.retain('recent', 9000); // 3s before it — inside the blind window
    r.sealOnClose(12_000);

    const { frames, dropped } = r.takeForReplay(12_100);
    expect(frames).toEqual(['recent']);
    expect(dropped).toBe(1);
  });

  it('keeps the full window however long the reconnect takes', () => {
    // The regression this design exists for. Measuring send-to-replay meant a
    // 4.42s reconnect gap ate most of the budget and a message was lost anyway.
    // Anchored on the close, the gap is irrelevant.
    const r = new SendRetention(opts);

    r.retain('sent-just-before-death', 20_000);
    r.sealOnClose(21_000);

    // Reconnect takes 60s — far past maxAgeMs measured from the send.
    expect(r.takeForReplay(81_000).frames).toEqual(['sent-just-before-death']);
  });

  it('does not re-queue a frame that is already waiting to be sent', () => {
    // A frame whose ws.send threw is pushed to pendingEnvelopes by the caller's
    // catch path. Replaying it too would send it twice.
    const r = new SendRetention(opts);

    r.retain('a', 1000);
    r.retain('b', 1100);
    r.sealOnClose(1200);

    expect(r.takeForReplay(1300, ['b']).frames).toEqual(['a']);
  });

  it('empties the buffer on take, so a later open cannot replay twice', () => {
    const r = new SendRetention(opts);

    r.retain('a', 1000);
    r.sealOnClose(1100);

    expect(r.takeForReplay(1200).frames).toEqual(['a']);
    expect(r.takeForReplay(1300).frames).toEqual([]);
    expect(r.size).toBe(0);
  });

  it('keeps sealed frames across failed reconnect attempts', () => {
    // A reconnect that never opens still fires onclose. That second close must
    // not discard what the first one sealed.
    const r = new SendRetention(opts);

    r.retain('a', 1000);
    r.sealOnClose(1100); // real death
    r.sealOnClose(2100); // failed attempt — nothing live to seal
    r.sealOnClose(3100); // and another

    expect(r.takeForReplay(4000).frames).toEqual(['a']);
  });

  it('seals against the reopen when a close was never observed', () => {
    const r = new SendRetention(opts);

    r.retain('stale', 1000);
    r.retain('fresh', 20_000);

    // No sealOnClose at all: fall back to aging against the open, which is the
    // best information available.
    const { frames, dropped } = r.takeForReplay(21_000);
    expect(frames).toEqual(['fresh']);
    expect(dropped).toBe(1);
  });

  it('caps the buffer, discarding the oldest frames first', () => {
    const r = new SendRetention(opts); // maxFrames: 5

    for (let i = 1; i <= 8; i++) {
      r.retain(`f${i}`, 1000 + i);
    }
    expect(r.size).toBe(5);

    r.sealOnClose(1100);
    expect(r.takeForReplay(1200).frames).toEqual(['f4', 'f5', 'f6', 'f7', 'f8']);
  });

  it('caps across connections, counting the overflow as dropped', () => {
    const r = new SendRetention(opts); // maxFrames: 5

    for (let i = 1; i <= 4; i++) r.retain(`a${i}`, 1000);
    r.sealOnClose(1100);
    for (let i = 1; i <= 4; i++) r.retain(`b${i}`, 1200);
    r.sealOnClose(1300);

    const { frames, dropped } = r.takeForReplay(1400);
    expect(frames).toEqual(['a4', 'b1', 'b2', 'b3', 'b4']);
    expect(dropped).toBe(3);
  });

  it('reports nothing to replay when nothing was ever sent', () => {
    const r = new SendRetention(opts);

    r.sealOnClose(1000);
    expect(r.takeForReplay(2000)).toEqual({ frames: [], dropped: 0 });
  });

  it('clear() forgets both live and sealed frames', () => {
    const r = new SendRetention(opts);

    r.retain('a', 1000);
    r.sealOnClose(1100);
    r.retain('b', 1200);
    expect(r.size).toBe(2);

    r.clear();
    expect(r.size).toBe(0);
    expect(r.takeForReplay(1300).frames).toEqual([]);
  });

  it('carries the attempt count across replays but restarts the clock', () => {
    // Re-retaining is the point: the socket a replay lands on can be dead too.
    // Its exposure is to THAT socket's death, so the clock has to restart, or
    // the first reconnect gap would count against every later attempt.
    const r = new SendRetention({ ...opts, maxReplays: 3 });

    r.retain('a', 1000);
    r.sealOnClose(1100);
    expect(r.takeForReplay(1200).frames).toEqual(['a']); // attempt 1

    r.retain('a', 50_000); // re-sent on the new socket, far past maxAgeMs
    r.sealOnClose(50_100);
    expect(r.takeForReplay(50_200).frames).toEqual(['a']); // attempt 2
  });

  it('gives up on a frame once its replays are exhausted', () => {
    // Without this, a flapping link chases the same frame forever, because
    // every replay restarts its clock.
    const r = new SendRetention({ ...opts, maxReplays: 2 });

    let t = 1000;
    for (let attempt = 1; attempt <= 2; attempt++) {
      r.retain('a', t);
      r.sealOnClose(t + 100);
      expect(r.takeForReplay(t + 200).frames).toEqual(['a']);
      t += 1000;
    }

    r.retain('a', t);
    r.sealOnClose(t + 100);
    const { frames, dropped } = r.takeForReplay(t + 200);
    expect(frames).toEqual([]);
    expect(dropped).toBe(1);
  });

  it('counts replays per frame, not across the buffer', () => {
    const r = new SendRetention({ ...opts, maxReplays: 1 });

    r.retain('a', 1000);
    r.sealOnClose(1100);
    expect(r.takeForReplay(1200).frames).toEqual(['a']); // a: attempt 1, spent

    r.retain('a', 2000); // replayed frame, out of attempts
    r.retain('b', 2000); // fresh frame, untouched by a's history
    r.sealOnClose(2100);
    expect(r.takeForReplay(2200).frames).toEqual(['b']);
  });

  it('defaults are wide enough for the measured blind window', () => {
    const r = new SendRetention(); // 12s / 200 frames

    r.retain('a', 0);
    r.sealOnClose(11_000); // 11s before death — still inside the default window
    expect(r.takeForReplay(11_100).frames).toEqual(['a']);
  });
});
