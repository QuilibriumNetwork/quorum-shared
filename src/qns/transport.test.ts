/**
 * The QNS transport: base URL, request deadline, and how the two abort sources
 * compose.
 *
 * ## Why these tests are worth their weight
 *
 * The thing under test is an ABSENCE — a request that does not hang forever —
 * and an absence is exactly what a test suite fails to notice. Before this
 * module the shared resolver had no timeout on either endpoint, and every
 * existing test passed, because a mocked `fetch` always answers. Nothing short
 * of a deliberately unanswered request can tell the difference.
 *
 * Precisely: that gap was DESKTOP's, whose only QNS path is this package.
 * Mobile has never used these entry points — it has its own `qnsClient`, which
 * already time-boxes the connection at 30s. It does not bound the response
 * BODY, though, which is a hang this module does catch and mobile's does not
 * (see `stalledBodyFetch` below).
 *
 * So every deadline test here drives a `fetch` that never resolves on its own
 * and only settles when its signal aborts, which is what a real `fetch` does.
 * The mock is the instrument; if it ever silently starts resolving, the control
 * arms below (the "does not fire early" and "1100ms DOES time out" cases) go
 * red rather than the suite going quietly green.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveName,
  resolveNamesBatch,
  QNS_BASE_URL,
  QNS_DEFAULT_TIMEOUT_MS,
} from './index';
import { logger } from '../utils/logger';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** What a real `fetch` rejects with when its signal aborts. */
const abortError = () => {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
};

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const signalOf = (init: unknown) => (init as { signal?: AbortSignal }).signal;

/** The names a batch POST carries, so a double can answer in alignment. */
const namesIn = (init: unknown) =>
  JSON.parse((init as { body: string }).body).names as string[];

/**
 * Reject when the signal aborts — INCLUDING when it has already aborted.
 *
 * The already-aborted branch is not defensive padding: a real `fetch` checks
 * `signal.aborted` before it does anything and rejects synchronously, so a
 * double that only waits for the event never settles for a caller who passed a
 * pre-aborted signal. Without it, the "already aborted" test below hangs and
 * reports a 5s timeout rather than the assertion it was written to make.
 */
const rejectOnAbort = (signal: AbortSignal | undefined, reject: (err: Error) => void) => {
  if (!signal) return;
  if (signal.aborted) {
    reject(abortError());
    return;
  }
  signal.addEventListener('abort', () => reject(abortError()));
};

/**
 * A resolver that accepts the connection and then never answers — the exact
 * failure `fetch` has no built-in defence against. Settles only on abort.
 */
const hangingFetch = () =>
  vi.fn().mockImplementation(
    (_url: string, init: unknown) =>
      new Promise((_resolve, reject) => rejectOnAbort(signalOf(init), reject)),
  );

/**
 * Headers arrive promptly, then the body stream stalls. A deadline cleared as
 * soon as `fetch` resolves would miss this entirely — same hang, one step
 * further along.
 */
const stalledBodyFetch = () =>
  vi.fn().mockImplementation((_url: string, init: unknown) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => rejectOnAbort(signalOf(init), reject)),
    }),
  );

/**
 * A batch resolver that answers after `delayMs` of simulated time, in
 * positional alignment with the names it was sent — otherwise the alignment
 * guard in `postBatch` rejects the response and the test measures that instead
 * of the deadline.
 */
const slowBatchFetch = (delayMs: number) =>
  vi.fn().mockImplementation((_url: string, init: unknown) => {
    const records = namesIn(init).map((n) => ({ resolveKey: n }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(okResponse({ records })), delayMs);
      rejectOnAbort(signalOf(init), (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  });

const urlOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  mock.mock.calls[call][0] as string;

/**
 * The error a promise rejected with, for tests that need to inspect it rather
 * than just match its message.
 *
 * Throws when the promise RESOLVES, which `.catch(err => err)` would not: that
 * form hands back the resolved value and every `err.name` assertion against it
 * quietly reads `undefined`, so a request that stopped failing would look like
 * a request that failed differently.
 *
 * Call it before advancing fake timers — it attaches its handler synchronously,
 * so the rejection is never unhandled.
 */
const rejectionOf = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the request to reject, but it resolved');
};

describe('the request deadline', () => {
  it('rejects a request that never answers, at the default deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    const assertion = expect(resolveName('alice')).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(QNS_DEFAULT_TIMEOUT_MS);
    await assertion;
  });

  it('CONTROL: does not fire one millisecond early', async () => {
    // Without this arm, a deadline wired to fire immediately would pass the
    // test above while aborting every real request the moment it started.
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    let settled = false;
    const promise = resolveName('alice').catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(QNS_DEFAULT_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(settled).toBe(true);
  });

  it('honours a shorter timeoutMs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    const assertion = expect(
      resolveName('alice', { timeoutMs: 50 }),
    ).rejects.toThrow(/timed out after 50ms/);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it('bounds a stalled response BODY, not just a stalled connection', async () => {
    // `fetch` resolves when headers arrive. Releasing the deadline there — the
    // obvious place, and what mobile's own client does — leaves a body stream
    // that never finishes completely unbounded.
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalledBodyFetch());

    const assertion = expect(
      resolveName('alice', { timeoutMs: 100 }),
    ).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('reports a timeout under its own name, not as an AbortError', async () => {
    // Diagnostic, not behavioural — stated precisely because the obvious guess
    // is wrong and an earlier version of this comment asserted it.
    //
    // MEASURED against the installed `@tanstack/query-core` (5.90.12 here,
    // 5.96.2 in desktop): a rejection named `AbortError` and a plain `Error`
    // both settle the query as `status: 'error'`. React Query detects
    // cancellation through its own internal `CancelledError`, never through
    // `error.name`. So this does NOT decide whether the consumer fails closed.
    //
    // What it does decide is whether the cause is legible. "The operation was
    // aborted" is the identical message a user navigating away produces, so a
    // resolver that has been dead for a week would be indistinguishable from
    // routine cancellation in any log. That is worth a wrapper on its own.
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    const caught = rejectionOf(resolveName('alice', { timeoutMs: 10 }));
    await vi.advanceTimersByTimeAsync(10);

    const err = await caught;
    expect(err.name).toBe('Error');
    expect(err.name).not.toBe('AbortError');
  });

  it("disables the deadline for the explicit 'none', and only for that", async () => {
    // A word, not a magic number. The number a caller most plausibly computes
    // by accident is 0, so 0 must NOT mean this — see the case below.
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' })));

    await expect(resolveName('alice', { timeoutMs: 'none' })).resolves.toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['0, e.g. Math.max(0, budget - elapsed)', 0],
    ['NaN, e.g. Number(anUnsetEnvVar)', NaN],
    ['a negative', -1],
    ['Infinity', Infinity],
    ['a string from an untyped caller', '30000' as unknown as number],
    ['null from a JSON config', null as unknown as number],
  ])(
    'falls back to the DEFAULT deadline for %s — never to no deadline at all',
    async (_label, bad) => {
      // The most important test in this file, and the one that was missing.
      //
      // Failing toward "no deadline" here would restore the unbounded hang this
      // whole module exists to remove, reachable by a plausible configuration
      // mistake rather than by intent — and silently, because a request with no
      // deadline looks exactly like one that has not answered yet.
      //
      // So the assertion is not merely "it did not resolve". It is that the
      // request is bounded, at the DEFAULT, which is the only outcome that
      // preserves the module's guarantee.
      vi.useFakeTimers();
      vi.stubGlobal('fetch', hangingFetch());

      const caught = rejectionOf(resolveName('alice', { timeoutMs: bad }));

      // Nothing has happened yet at the one-millisecond mark: it did not fall
      // back to "abort immediately" either.
      await vi.advanceTimersByTimeAsync(1);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(QNS_DEFAULT_TIMEOUT_MS);
      expect((await caught).message).toMatch(
        new RegExp(`timed out after ${QNS_DEFAULT_TIMEOUT_MS}ms`),
      );
    },
  );
});

describe('the caller signal', () => {
  it('aborts the request, and reports the abort rather than a timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    const controller = new AbortController();
    const caught = rejectionOf(resolveName('alice', { signal: controller.signal }));

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    const err = await caught;
    expect(err.name).toBe('AbortError');
    expect(err.message).not.toMatch(/timed out/i);
  });

  it('aborts immediately when the signal is already aborted', async () => {
    // A React Query signal can arrive pre-aborted if the query was cancelled
    // between scheduling and running. Attaching a listener to an
    // already-fired signal would never hear it, leaving the request to run to
    // completion under only the deadline.
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    controller.abort();

    const caught = rejectionOf(resolveName('alice', { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);

    expect((await caught).name).toBe('AbortError');
    expect(signalOf(fetchMock.mock.calls[0][1])?.aborted).toBe(true);
  });

  it('is accepted bare by resolveNamesBatch, the compatibility surface', async () => {
    // Desktop calls `resolveNamesBatch(names, signal)` today, so that arm of the
    // union has to keep working. `resolveName` deliberately does NOT take it —
    // see the compile-time assertion below.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ records: [null] })));

    const controller = new AbortController();
    await expect(resolveNamesBatch(['alice'], controller.signal)).resolves.toBeTruthy();
  });

  it('is a COMPILE error on resolveName, which is the point', () => {
    // `@ts-expect-error` is the assertion: the build fails if the next line
    // stops being an error. So this pins the narrowing itself, not a runtime
    // consequence of it.
    //
    // Worth pinning because the reasoning is counterintuitive. `resolveName`
    // once took the union too, on the theory that an options-only parameter
    // would let a signal through silently as a weak-typed object. MEASURED with
    // `tsc --strict`: it does not. TypeScript rejects an argument sharing zero
    // fields with an all-optional interface (TS2559), so the narrower signature
    // is strictly safer — the mistake is caught at the call site instead of
    // being accepted and quietly ignored.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' })));
    const controller = new AbortController();

    // @ts-expect-error a bare AbortSignal is not a QnsRequestOptions
    void resolveName('alice', controller.signal);
  });
});

describe('cleanup', () => {
  it('leaves no pending timer after a successful request', async () => {
    // A live 30-second timer holds a Node process open past a fast response and
    // keeps a reference to the controller. Nothing else in the suite would
    // notice, which is why it is asserted directly.
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' })));

    await resolveName('alice');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no pending timer after a failed request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(resolveName('alice')).rejects.toThrow();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('detaches the SAME listener it attached, from the caller signal', async () => {
    // A caller signal can outlive one request. Without the detach, a long-lived
    // signal accumulates one listener per request and eventually warns about a
    // leak — after the leak has already been there for a while.
    //
    // Asserting the exact function REFERENCE, not `expect.any(Function)`.
    // Detaching some other function is a no-op that leaves the real listener
    // attached, and a loose matcher passes happily while the leak continues.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' })));

    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');

    await resolveName('alice', { signal: controller.signal });

    const attached = add.mock.calls[0]?.[1];
    expect(attached).toBeTypeOf('function');
    expect(remove).toHaveBeenCalledWith('abort', attached);
  });

  it('two concurrent requests can share one caller signal', async () => {
    // React Query hands the same signal shape to every query, and two surfaces
    // can resolve different claim sets at once. Each request must get its own
    // controller and its own listener, or one finishing would tear down the
    // other's cancellation.
    vi.stubGlobal('fetch', hangingFetch());

    const controller = new AbortController();
    const first = rejectionOf(resolveName('alice', { signal: controller.signal }));
    const second = rejectionOf(resolveName('bob', { signal: controller.signal }));

    controller.abort();

    expect((await first).name).toBe('AbortError');
    expect((await second).name).toBe('AbortError');
  });
});

describe('with the deadline explicitly disabled', () => {
  // The opt-out branch of `startDeadline` returns its own `expired: () => false`
  // and passes the caller's signal straight through. Nothing else in the file
  // reaches that closure, so without these two tests the whole branch is only
  // ever exercised on the happy path.

  it('a server error still reports its own message, not a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const err = await rejectionOf(resolveName('alice', { timeoutMs: 'none' }));

    expect(err.message).toMatch(/500/);
    expect(err.message).not.toMatch(/timed out/i);
  });

  it('a caller abort still aborts the request', async () => {
    // The opt-out path hands the caller's signal to `fetch` unwrapped. If that
    // passthrough were dropped, opting out of the DEADLINE would silently also
    // opt out of CANCELLATION, which no caller asked for.
    vi.stubGlobal('fetch', hangingFetch());

    const controller = new AbortController();
    const caught = rejectionOf(
      resolveName('alice', { timeoutMs: 'none', signal: controller.signal }),
    );
    controller.abort();

    expect((await caught).name).toBe('AbortError');
  });
});

describe('all three options together', () => {
  it('applies baseUrl, timeoutMs and signal in one call', async () => {
    // Every other test isolates a single field. Composition bugs in
    // `normalizeRequestOptions` are exactly the kind isolated tests miss.
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const caught = rejectionOf(
      resolveName('alice', {
        baseUrl: 'https://names.example.test/',
        timeoutMs: 40,
        signal: controller.signal,
      }),
    );

    expect(urlOf(fetchMock)).toBe('https://names.example.test/resolve/alice');
    expect(signalOf(fetchMock.mock.calls[0][1])?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(40);
    expect((await caught).message).toMatch(/timed out after 40ms/);
  });
});

describe('the base URL', () => {
  it('defaults to production', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveName('alice');

    expect(urlOf(fetchMock)).toBe(`${QNS_BASE_URL}/resolve/alice`);
  });

  it('uses a configured resolver instead', async () => {
    // Mobile registers names through its own client, which honours an
    // `EXPO_PUBLIC_QNS_API_URL` override. Verifying against production while
    // registering somewhere else would silently unverify every name in a
    // non-production build, with nothing in either path saying so.
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveName('alice', { baseUrl: 'https://names.example.test' });

    expect(urlOf(fetchMock)).toBe('https://names.example.test/resolve/alice');
  });

  it('strips trailing slashes, which a configured URL usually has', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveName('alice', { baseUrl: 'https://names.example.test//' });

    expect(urlOf(fetchMock)).toBe('https://names.example.test/resolve/alice');
  });

  it('falls back to production for a blank base URL, and says so', async () => {
    // An unset env var reaching here as '' must not produce a relative URL,
    // which in a React Native runtime has no origin to resolve against.
    //
    // The warning is asserted, not just the fallback. Present-but-blank is a
    // misconfiguration and omitted is not, and a build that verifies against
    // production while registering names somewhere else is exactly the silent
    // divergence this option was added to prevent — so the two cases must not
    // be indistinguishable at runtime.
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveName('alice', { baseUrl: '   ' });

    expect(urlOf(fetchMock)).toBe(`${QNS_BASE_URL}/resolve/alice`);
    expect(warn).toHaveBeenCalled();
  });

  it('CONTROL: omitting baseUrl entirely is silent', async () => {
    // Without this arm, a warning fired unconditionally would pass the test
    // above while shouting on every well-configured request in development.
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ address: 'QmABC' })));

    await resolveName('alice');

    expect(warn).not.toHaveBeenCalled();
  });

  it('reaches every chunk of a batch, not just the first', async () => {
    const names = Array.from({ length: 101 }, (_, i) => `n${i}`);
    const fetchMock = vi.fn().mockImplementation((_url: string, init: unknown) => {
      const sent = JSON.parse((init as { body: string }).body).names as string[];
      return Promise.resolve(okResponse({ records: sent.map((n) => ({ resolveKey: n })) }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await resolveNamesBatch(names, { baseUrl: 'https://names.example.test' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(fetchMock, 0)).toBe('https://names.example.test/resolve/batch');
    expect(urlOf(fetchMock, 1)).toBe('https://names.example.test/resolve/batch');
  });
});

describe('a chunked batch gets a deadline per request, not per call', () => {
  const chunkedNames = Array.from({ length: 101 }, (_, i) => `n${i}`);

  it('allows a large roster to exceed the budget in total', async () => {
    // Two requests of 900ms each under a 1000ms budget: 1800ms of wall clock,
    // and both must succeed. A whole-operation budget would abort the second
    // chunk and unverify everybody on screen — the failure the chunking exists
    // to prevent in the first place.
    vi.useFakeTimers();
    vi.stubGlobal('fetch', slowBatchFetch(900));

    const promise = resolveNamesBatch(chunkedNames, { timeoutMs: 1000 });
    // Two awaits rather than one advance: the second request is not created
    // until the first resolves, so the clock has to move in stages.
    await vi.advanceTimersByTimeAsync(900);
    await vi.advanceTimersByTimeAsync(900);

    await expect(promise).resolves.toBeTruthy();
  });

  it('CONTROL: the same budget still kills one request that overruns it', async () => {
    // Proves the test above passes because the deadline RESTARTS, not because
    // the deadline is broken. Without this arm, a `timeoutMs` that never armed
    // would look identical.
    vi.useFakeTimers();
    vi.stubGlobal('fetch', slowBatchFetch(1100));

    const assertion = expect(
      resolveNamesBatch(chunkedNames, { timeoutMs: 1000 }),
    ).rejects.toThrow(/timed out after 1000ms/);
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
  });
});
