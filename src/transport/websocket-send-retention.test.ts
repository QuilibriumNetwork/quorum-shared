/**
 * Wiring tests for send-side retention, driven through the real clients.
 *
 * send-retention.test.ts proves the policy. This file proves the clients use it
 * correctly, by reproducing the field failure in miniature: a socket that has
 * been killed with no close frame keeps accepting writes, so `ws.send()`
 * succeeds and the frame is silently swallowed. Both implementations must
 * replay it on the next open.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserWebSocketClient } from './browser-websocket';
import { RNWebSocketClient } from './rn-websocket';
import type { WebSocketClientOptions } from './websocket';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];
  static latest(): FakeWebSocket {
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!ws) throw new Error('no socket was constructed');
    return ws;
  }

  readyState: number = FakeWebSocket.CONNECTING;
  /** Every frame send() accepted. */
  sent: string[] = [];
  /** Frames accepted after the socket was already dead — i.e. lost. */
  swallowed: string[] = [];
  /** Test hook, runs after a frame is accepted. */
  onSend: ((frame: string) => void) | null = null;

  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  private dead = false;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(frame: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error('socket is not open');
    }
    this.sent.push(frame);
    if (this.dead) {
      this.swallowed.push(frame);
    }
    this.onSend?.(frame);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  // ---- test helpers ----

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /**
   * What the relay actually does: kill the connection with no close frame. The
   * client still sees readyState OPEN and keeps writing for seconds.
   */
  killSilently(): void {
    this.dead = true;
  }
}

const tick = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

const CLIENTS = [
  ['RNWebSocketClient', RNWebSocketClient],
  ['BrowserWebSocketClient', BrowserWebSocketClient],
] as const;

describe.each(CLIENTS)('%s send retention', (_name, Client) => {
  let realWebSocket: unknown;
  let client: InstanceType<typeof Client> | null = null;

  const makeClient = (overrides: Partial<WebSocketClientOptions> = {}) => {
    client = new Client({
      url: 'wss://relay.test',
      reconnectInterval: 1,
      // Long enough that only the explicit drains below matter.
      queueProcessInterval: 60_000,
      ...overrides,
    });
    return client;
  };

  /** Connect and open the socket the client just constructed. */
  const connect = async (c: InstanceType<typeof Client>) => {
    const connected = c.connect();
    FakeWebSocket.latest().open();
    await connected;
  };

  /** Let the client notice the death and come back on a fresh socket. */
  const reconnect = async (dead: FakeWebSocket) => {
    dead.close();
    await tick();
    const next = FakeWebSocket.latest();
    expect(next).not.toBe(dead);
    next.open();
    await tick();
    return next;
  };

  beforeEach(() => {
    realWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    client?.disconnect();
    client = null;
    (globalThis as Record<string, unknown>).WebSocket = realWebSocket;
    vi.restoreAllMocks();
  });

  it('replays a frame swallowed by a socket that was already dead', async () => {
    const c = makeClient();
    await connect(c);
    const ws1 = FakeWebSocket.latest();

    c.enqueueOutbound(async () => ['A']);
    await tick();
    expect(ws1.sent).toEqual(['A']);

    // The relay kills the connection. readyState stays OPEN, so the next send
    // is accepted and lost — this is the whole bug.
    ws1.killSilently();
    c.enqueueOutbound(async () => ['B']);
    await tick();
    expect(ws1.sent).toEqual(['A', 'B']);
    expect(ws1.swallowed).toEqual(['B']);

    const ws2 = await reconnect(ws1);

    // B is rescued. A rides along as a duplicate, which is harmless: its
    // message key is already consumed, so it fails AEAD and is discarded.
    expect(ws2.sent).toEqual(['A', 'B']);
    expect(ws2.swallowed).toEqual([]);
  });

  it('keeps replayed frames ahead of frames caught mid-batch', async () => {
    const c = makeClient();
    await connect(c);
    const ws1 = FakeWebSocket.latest();

    c.enqueueOutbound(async () => ['A']);
    await tick();

    // A fan-out batch that half-lands: B1 goes out, then the socket transitions
    // before B2, which the per-send readyState check pushes to pendingEnvelopes.
    ws1.onSend = (frame) => {
      if (frame === 'B1') ws1.readyState = FakeWebSocket.CLOSING;
    };
    c.enqueueOutbound(async () => ['B1', 'B2']);
    await tick();
    expect(ws1.sent).toEqual(['A', 'B1']);

    const ws2 = await reconnect(ws1);

    // Replayed frames (A, B1) are older than the mid-batch casualty (B2) and
    // must go out first, or the recipient sees them out of ratchet order.
    expect(ws2.sent).toEqual(['A', 'B1', 'B2']);
  });

  it('chases a frame through repeated deaths, then gives up', async () => {
    // A replayed frame lands on a socket that can be dead too, so it is
    // retained again — but only for a bounded number of attempts.
    const c = makeClient({ sendRetention: { maxReplays: 2 } });
    await connect(c);
    let ws = FakeWebSocket.latest();

    c.enqueueOutbound(async () => ['A']);
    await tick();
    expect(ws.sent).toEqual(['A']);

    ws = await reconnect(ws);
    expect(ws.sent).toEqual(['A']); // replay 1

    ws = await reconnect(ws);
    expect(ws.sent).toEqual(['A']); // replay 2 — the last one allowed

    ws = await reconnect(ws);
    expect(ws.sent).toEqual([]);
  });

  it('drops frames sent long before the socket died', async () => {
    // Same shape as the field default, only shrunk so the test does not sleep.
    const c = makeClient({ sendRetention: { maxAgeMs: 100 } });
    await connect(c);
    const ws1 = FakeWebSocket.latest();

    c.enqueueOutbound(async () => ['old']);
    await tick(250); // ages past the window while the socket is still healthy

    c.enqueueOutbound(async () => ['recent']);
    await tick(10);
    const ws2 = await reconnect(ws1);

    expect(ws1.sent).toEqual(['old', 'recent']);
    expect(ws2.sent).toEqual(['recent']);
  });

  it('logs the replay so a field capture can be read for it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = makeClient();
    await connect(c);
    const ws1 = FakeWebSocket.latest();

    c.enqueueOutbound(async () => ['A']);
    await tick();
    await reconnect(ws1);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[WS-retain] replaying 1 frame(s)'));
  });

  it('breaks the drop count down by cause', async () => {
    // A single total cannot say whether a reconnect was the benign steady state
    // or real loss: aged-out frames went over a connection the relay was still
    // acknowledging, while the other two causes are frames worth retrying that
    // were not retried. Reading a combined number as if it were all loss is the
    // mistake this breakdown exists to prevent.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = makeClient({ sendRetention: { maxAgeMs: 100 } });
    await connect(c);
    const ws1 = FakeWebSocket.latest();

    c.enqueueOutbound(async () => ['old']);
    await tick(250); // ages out while the socket is still healthy

    c.enqueueOutbound(async () => ['recent']);
    await tick(10);
    await reconnect(ws1);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'replaying 1 frame(s) from the previous connection ' +
          '(gave up on 1: 1 aged out, 0 out of replays, 0 over the buffer cap)'
      )
    );
  });

  it('reports frames that ran out of replays even when nothing was rescued', async () => {
    // An exhausted frame is a loss signal, and it surfaces on exactly the
    // reconnect that has nothing left to replay — so returning early on an
    // empty replay set would throw the signal away every time it mattered.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = makeClient({ sendRetention: { maxReplays: 1 } });
    await connect(c);
    let ws = FakeWebSocket.latest();

    c.enqueueOutbound(async () => ['A']);
    await tick();

    ws = await reconnect(ws); // replay 1 — the last one allowed
    expect(ws.sent).toEqual(['A']);

    warn.mockClear();
    await reconnect(ws);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'replaying 0 frame(s) from the previous connection ' +
          '(gave up on 1: 0 aged out, 1 out of replays, 0 over the buffer cap)'
      )
    );
  });

  it('stays quiet on a reconnect with nothing to replay', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = makeClient();
    await connect(c);

    await reconnect(FakeWebSocket.latest());

    expect(warn).not.toHaveBeenCalled();
  });
});
