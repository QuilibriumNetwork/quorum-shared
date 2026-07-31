/**
 * Send-side retention for the WebSocket clients.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ws.send()` returning without throwing means "the local buffer accepted these
 * bytes". It is not proof of delivery, in any WebSocket implementation. Field
 * measurement caught the gap exactly: the relay pings every ~9s and kills any
 * client whose pong is more than 1s late, and it kills with *no close frame* —
 * so the client keeps writing into a dead socket for 3.5-5s before it notices.
 * Every frame written in that blind window is accepted by `ws.send()`, dropped
 * from the outbound queue as "sent", and never delivered or retried. That was
 * measured as 15-25% message loss on mobile.
 *
 * `pendingEnvelopes` already rescues frames caught mid-batch at the moment the
 * failure surfaces, but that window is only ~1s wide while the lethal one is
 * ~5s. This buffer widens the same rescue; nothing else about the send path
 * changes.
 *
 * The relay-side fix (raising the pong deadline) stops connections dying in the
 * first place, but it does not make this redundant. Connections will keep
 * breaking for reasons the relay cannot touch: WiFi/cellular handover,
 * backgrounding, tunnels, genuine packet loss. A client with no send-side
 * durability loses messages silently on every one of those.
 *
 * HOW THE WINDOW IS MEASURED — read this before changing `maxAgeMs`
 * ----------------------------------------------------------------
 * A frame's age is measured from when it was sent to when the **socket died**,
 * NOT to when it is replayed. This matters: an earlier iteration measured
 * send-to-replay and lost a message anyway, because a 4.42s reconnect gap ate
 * most of a 6s budget and left only 1.58s of useful coverage. Anchoring on the
 * close removes that sensitivity entirely — a slow reconnect no longer shrinks
 * the protection.
 *
 * That also makes the constant derivable rather than fitted. The relay's own
 * pong deadline is 10s, so a frame sent more than ~10s before the socket died
 * went out over a connection the relay was still acknowledging. 12s is that
 * deadline plus margin, and it comfortably covers the worst blind window
 * observed in the field (~5s).
 *
 * This is still a stand-in for the thing that would settle it properly: a
 * protocol-level write ack, which would let retention run until something
 * actually confirms the write instead of until a timer expires. The policy is
 * isolated here so that swap stays a small change.
 *
 * REPLAYING IS SAFE
 * -----------------
 * Replay can re-send a frame that did arrive — the client knows when it
 * *noticed* the death, not when the relay caused it. That case is already
 * routine: the relay re-pushes frames before the delete lands, constantly,
 * today. A duplicate's message key was already consumed, so it fails AEAD, is
 * logged, and is deleted. No message is lost. It also cannot produce spurious
 * skipped keys, because those are filed when a frame arrives *ahead* of the
 * ratchet position and a replay sits *behind* it. The cost is log noise, not
 * damage.
 */

/** Retention window in ms, measured from send to socket close. See above. */
export const DEFAULT_SEND_RETENTION_MS = 12_000;

/** Frame cap. ~200 frames is ~33 messages at a 6-target fan-out. */
export const DEFAULT_SEND_RETENTION_FRAMES = 200;

/** How many dead sockets a single frame is chased through. See below. */
export const DEFAULT_SEND_RETENTION_REPLAYS = 3;

export interface SendRetentionOptions {
  /**
   * How long before the socket died a frame may have been sent and still be
   * worth replaying. Default: {@link DEFAULT_SEND_RETENTION_MS}.
   */
  maxAgeMs?: number;
  /**
   * Hard cap on retained frames, so a long-lived connection cannot grow the
   * buffer without bound. Default: {@link DEFAULT_SEND_RETENTION_FRAMES}.
   */
  maxFrames?: number;
  /**
   * How many times one frame may be replayed before it is given up on.
   *
   * A replayed frame is retained again, because the socket it lands on can be
   * dead too. But re-retaining restarts its clock, so without a cap a flapping
   * link would chase the same frame forever. The cap makes the bound explicit:
   * a few honest attempts, then stop.
   *
   * Default: {@link DEFAULT_SEND_RETENTION_REPLAYS}.
   */
  maxReplays?: number;
}

/** Outcome of {@link SendRetention.takeForReplay}. */
export interface SendRetentionReplay {
  /** Frames to re-queue, in the order they were originally sent. */
  frames: string[];
  /**
   * Frames given up on: sent too long before the socket died, over the frame
   * cap, or out of replay attempts.
   */
  dropped: number;
}

interface RetainedFrame {
  frame: string;
  sentAt: number;
  /** How many times this frame has already been replayed. */
  replays: number;
}

/**
 * Tracks frames handed to a socket so they can be replayed if that socket turns
 * out to have been dead.
 *
 * Deliberately pure: no socket, no timers, no clock of its own — callers pass
 * `now` in. That keeps the retention policy testable on its own, which is the
 * point of having it in a separate file.
 *
 * Lifecycle, one connection at a time:
 *
 *   retain() … retain()   frames written to the socket that is currently open
 *   sealOnClose(t)        socket died — keep the ones still worth retrying
 *   takeForReplay(t, q)   socket reopened — hand the survivors back for requeue
 */
export class SendRetention {
  private readonly maxAgeMs: number;
  private readonly maxFrames: number;
  private readonly maxReplays: number;

  /** Frames written to the socket that is currently open. */
  private live: RetainedFrame[] = [];
  /** Frames from a socket that has since closed, waiting for the next open. */
  private sealed: RetainedFrame[] = [];
  /** Discarded frames since the last take, reported for diagnostics. */
  private discarded = 0;
  /**
   * Replay counts for frames handed back but not yet re-sent. Consumed by the
   * matching `retain`, so it holds at most the frames of one in-flight replay.
   */
  private replayed = new Map<string, number>();

  constructor(options: SendRetentionOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_SEND_RETENTION_MS;
    this.maxFrames = options.maxFrames ?? DEFAULT_SEND_RETENTION_FRAMES;
    this.maxReplays = options.maxReplays ?? DEFAULT_SEND_RETENTION_REPLAYS;
  }

  /** Record a frame that was just handed to the socket without throwing. */
  retain(frame: string, now: number): void {
    // A frame coming back around after a replay keeps its attempt count but
    // gets a fresh clock: it was just written to a different socket, and its
    // exposure is to *that* socket's death.
    const replays = this.replayed.get(frame) ?? 0;
    this.replayed.delete(frame);

    this.live.push({ frame, sentAt: now, replays });
    if (this.live.length > this.maxFrames) {
      this.live.splice(0, this.live.length - this.maxFrames);
    }
  }

  /**
   * The socket closed. Frames written within `maxAgeMs` of that moment may
   * never have reached the relay, so they are held for the next open. Anything
   * older went out over a connection that was still being acknowledged.
   *
   * Additive on purpose: a failed reconnect attempt closes too, and must not
   * discard what an earlier close already sealed.
   */
  sealOnClose(closedAt: number): void {
    if (this.live.length === 0) {
      return;
    }

    const cutoff = closedAt - this.maxAgeMs;
    for (const entry of this.live) {
      if (entry.sentAt >= cutoff && entry.replays < this.maxReplays) {
        this.sealed.push(entry);
      } else {
        this.discarded++;
      }
    }
    this.live = [];

    if (this.sealed.length > this.maxFrames) {
      this.discarded += this.sealed.length - this.maxFrames;
      this.sealed.splice(0, this.sealed.length - this.maxFrames);
    }
  }

  /**
   * The socket reopened. Returns the frames to put back on the queue and
   * empties the buffer, so a later open cannot replay them a second time.
   *
   * @param alreadyQueued frames already awaiting send — a frame whose `ws.send`
   *   threw is pushed there by the caller's catch path, and must not be queued
   *   twice.
   */
  takeForReplay(now: number, alreadyQueued: readonly string[] = []): SendRetentionReplay {
    // Defensive: reaching an open with a non-empty live buffer means the close
    // for the previous socket was never observed. Treat the reopen as the
    // moment of death rather than silently keeping stale frames around.
    this.sealOnClose(now);

    const queued = new Set(alreadyQueued);
    const frames: string[] = [];
    for (const entry of this.sealed) {
      if (queued.has(entry.frame)) {
        continue;
      }
      frames.push(entry.frame);
      this.replayed.set(entry.frame, entry.replays + 1);
    }

    const dropped = this.discarded;
    this.sealed = [];
    this.discarded = 0;

    return { frames, dropped };
  }

  /** Forget everything. */
  clear(): void {
    this.live = [];
    this.sealed = [];
    this.discarded = 0;
    this.replayed.clear();
  }

  /** Frames currently held, live plus sealed. Diagnostics and tests. */
  get size(): number {
    return this.live.length + this.sealed.length;
  }
}
