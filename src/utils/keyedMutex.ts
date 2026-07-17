/**
 * KeyedMutex — per-key async mutual exclusion (FIFO).
 *
 * Serializes async operations that share a key: callers on the same key run
 * strictly one at a time in arrival order; different keys don't block each
 * other.
 *
 * Primary use case: Double Ratchet state operations. Ratchet state is
 * strictly linear — every operation (encrypt on send, decrypt on receive)
 * must read the latest saved state, advance it, and save the result. Two
 * operations that read the same state concurrently fork the ratchet:
 * whichever save lands last silently erases the other's advance, and from
 * then on the peer cannot derive the message keys for the erased branch
 * (surfaces as `aead::Error` on subsequent frames). The Signal spec models
 * encrypt/decrypt as sequential mutations of a single state object;
 * concurrent divergent copies have no defined meaning.
 * (https://signal.org/docs/specifications/doubleratchet/)
 *
 * Usage: create one app-level instance and wrap every
 * read-state → ratchet-op → save-state critical section in
 * `runExclusive(conversationId, fn)`.
 *
 * Do NOT hold the lock across transport delivery: if the delivery queue's
 * callbacks also take this lock, waiting for delivery inside the lock is a
 * circular wait. Note that an async callback returning a promise gets
 * auto-flattened — returning a delivery promise from `fn` silently extends
 * the critical section until delivery. Wrap such promises in an object to
 * return them without awaiting.
 *
 * Serializes within one JS context only. Two contexts (browser tabs, a
 * React Native headless background task vs the foreground app) still race
 * each other and need a cross-context mechanism.
 */
export class KeyedMutex {
  private tails = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(key, current);
    await prev;
    try {
      return await fn();
    } finally {
      // Drop the map entry when no later caller has replaced our tail,
      // so idle keys don't accumulate forever.
      if (this.tails.get(key) === current) {
        this.tails.delete(key);
      }
      release();
    }
  }
}
