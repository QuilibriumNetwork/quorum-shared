/**
 * The one place QNS requests reach the network.
 *
 * Both entry points — `resolveName` and `resolveNamesBatch` — go through
 * `qnsRequest`, so the base URL and the deadline are decided once instead of
 * per call site. Nothing in here is exported from the package; callers see only
 * the `QnsRequestOptions` shape re-exported by `resolver.ts`.
 *
 * ## Why a deadline exists at all
 *
 * `fetch` has no timeout. A resolver that accepts the connection and then never
 * answers leaves the request pending for as long as the platform's socket
 * timeout allows, which in a browser or Electron renderer is effectively
 * forever. Both clients cache a verification result for an hour and neither
 * retries, so a hung lookup is not a spinner the user can wait out: it is a
 * render in which every legitimate `.q` is missing, indistinguishable from the
 * feature not existing, with nothing logged.
 *
 * An `AbortSignal` from React Query does NOT cover this. That signal fires on
 * unmount or when a query is superseded — never on elapsed time — so a hung
 * request on a screen the user is still looking at is never aborted.
 *
 * ## The deadline is per REQUEST, not per operation
 *
 * `resolveNamesBatch` chunks at 100 names, so a 300-name roster is three
 * sequential requests and each gets its own deadline. Total wall-clock
 * therefore scales with chunk count. That is deliberate: this bound exists to
 * detect a hung connection, and a server answering each chunk in 25s is slow
 * rather than hung. A whole-operation budget would abort a working lookup on a
 * large roster, which unverifies everybody on screen — the failure mode this
 * feature already refuses elsewhere (see the chunking note in `resolveBatch`).
 *
 * ## Claims below about the two clients were true on 2026-08-17
 *
 * Several comments in this file cite specifics from `quorum-desktop` and
 * `quorum-mobile` — cache windows, retry settings, mobile's own timeout, its
 * env-var override. They were each verified against those repos on that date,
 * and nothing here can detect it when one of them changes: they live in
 * different repositories with no shared constant and no test spanning both.
 * Re-check before relying on one, and correct it here rather than working
 * around it.
 */

import { logger } from '../utils/logger';

/** Production resolver. Every request goes here unless a caller says otherwise. */
export const QNS_BASE_URL = 'https://names.quilibrium.com';

/**
 * Default per-request deadline, in milliseconds.
 *
 * 30s matches the timeout mobile's own `qnsClient` has used against this API
 * since before either client shared a transport, so adopting this default
 * changes no observed behaviour there. It is deliberately generous: the point
 * is to bound a hang, not to police a slow network, and aborting a request that
 * would have succeeded costs the user their `.q` for a full cache hour.
 */
export const QNS_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Per-request knobs for the QNS entry points.
 *
 * All three are optional and the defaults are production behaviour, so an
 * existing caller that passes nothing is unaffected.
 */
export interface QnsRequestOptions {
  /**
   * Abandon the request when this fires. A React Query caller should pass the
   * `signal` from its query context, so a lookup superseded by a widening claim
   * set is dropped rather than left to finish and have its answer discarded.
   *
   * This composes with the deadline rather than replacing it — see `qnsRequest`.
   */
  signal?: AbortSignal;
  /**
   * Resolver to talk to. Defaults to {@link QNS_BASE_URL}. Trailing slashes are
   * stripped, and a blank value falls back to the default rather than producing
   * a relative URL.
   *
   * Mobile needs this: it registers names through its own `qnsClient`, which
   * honours an `EXPO_PUBLIC_QNS_API_URL` override. Without the same override
   * here, a non-production build would register names against one resolver and
   * verify them against another, and nothing in either code path would say so.
   */
  baseUrl?: string;
  /**
   * Deadline for one request, in milliseconds. Defaults to
   * {@link QNS_DEFAULT_TIMEOUT_MS}.
   *
   * `'none'` — the literal string — is the ONLY way to disable the deadline.
   * Any number that is not finite and positive (`0`, a negative, `NaN`) is
   * treated as a MISTAKE: it falls back to the default and logs a warning.
   *
   * The word rather than a magic number is deliberate, and it is the difference
   * between a bound and no bound. `Number(process.env.SOMETHING_UNSET)` is
   * `NaN`; `Math.max(0, budget - elapsed)` is `0`. Both are plausible things a
   * caller computes, neither means "remove the timeout", and reading either as
   * an opt-out would silently restore the unbounded hang this module exists to
   * prevent. Nobody types `'none'` by accident.
   */
  timeoutMs?: number | 'none';
}

/**
 * What `resolveNamesBatch` accepts as its second argument.
 *
 * The bare `AbortSignal` arm exists for exactly one reason: desktop already
 * calls `resolveNamesBatch(names, signal)` (`src/identity/useVerifiedQnsNames.ts`),
 * and widening the parameter is cheaper and safer than editing a call site in
 * another repo that ships on its own schedule.
 *
 * `resolveName` deliberately does NOT accept it — it takes `QnsRequestOptions`
 * only, because nothing calls it with a bare signal. MEASURED with `tsc
 * --strict`: passing a signal to an options-only parameter is a compile error
 * (`TS2559: Type 'AbortSignal' has no properties in common with type
 * 'QnsRequestOptions'`), because TypeScript's weak-type detection rejects an
 * argument sharing zero fields with an all-optional interface. So the mistake
 * this union might have been added to prevent is already caught loudly by the
 * compiler, and the narrower signature is the better one.
 *
 * Known gap, accepted rather than fixed: weak-type detection only fires on
 * ZERO overlap. An unrelated config object that happens to have a
 * `baseUrl: string` field typechecks here with no error (verified — several
 * exist in this repo, e.g. `TransportConfig`). Guarding against that needs a
 * nominal brand, which would add real friction to two consuming apps for a
 * mistake nobody has made.
 */
export type QnsRequestInput = QnsRequestOptions | AbortSignal;

interface ResolvedRequestOptions {
  signal?: AbortSignal;
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Duck-typed rather than `instanceof AbortSignal`.
 *
 * A signal can cross a realm boundary — an Electron preload bridge, a React
 * Native polyfill, a test double — and `instanceof` is false across realms even
 * for a genuine signal. Getting that wrong would silently reinterpret a signal
 * as an options object: no abort, no error, and the caller's cancellation
 * quietly stops working. `aborted` is on every AbortSignal and on no plausible
 * options object.
 */
function isAbortSignal(value: QnsRequestInput): value is AbortSignal {
  return typeof (value as AbortSignal).aborted === 'boolean';
}

/** The value `resolveTimeoutMs` returns to mean "run without a deadline". */
const NO_DEADLINE = 0;

/**
 * Interpret a requested `timeoutMs`, failing toward HAVING a bound.
 *
 * The ordering matters more than it looks. An earlier version treated every
 * non-finite value as an opt-out, which meant `NaN` — the result of
 * `Number(someUnsetEnvVar)`, and of a JS caller passing the string `'30000'` —
 * silently produced a request with no deadline and no abort signal at all. That
 * is precisely the unbounded hang this module was added to remove, reachable by
 * a plausible configuration mistake rather than by intent.
 *
 * So only the two values that unambiguously MEAN "no deadline" opt out.
 * Everything else that cannot be used as a budget is a mistake, and a mistake
 * gets the default bound plus a warning.
 */
function resolveTimeoutMs(requested: number | 'none' | undefined): number {
  if (requested === undefined) return QNS_DEFAULT_TIMEOUT_MS;
  if (requested === 'none') return NO_DEADLINE;
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  logger.warn(
    '[qns/transport]',
    'timeoutMs is not a usable duration; falling back to the default deadline',
    { received: requested, usingMs: QNS_DEFAULT_TIMEOUT_MS },
  );
  return QNS_DEFAULT_TIMEOUT_MS;
}

function normalizeRequestOptions(input?: QnsRequestInput): ResolvedRequestOptions {
  const opts: QnsRequestOptions = !input ? {} : isAbortSignal(input) ? { signal: input } : input;

  const configured = typeof opts.baseUrl === 'string' ? opts.baseUrl.trim() : '';
  // Present-but-blank is a misconfiguration, not an omission, and the two must
  // not look the same. Falling back to production is the safe behaviour — a
  // relative URL has no origin to resolve against in a React Native runtime —
  // but doing it silently is how a build ends up registering names against one
  // resolver and verifying them against another with nothing saying so.
  if (typeof opts.baseUrl === 'string' && configured === '') {
    logger.warn(
      '[qns/transport]',
      'baseUrl was provided but blank; falling back to the production resolver',
    );
  }

  return {
    signal: opts.signal,
    // Strip trailing slashes so a configured `https://host/` cannot become
    // `https://host//resolve/batch`, which some gateways 404.
    baseUrl: (configured || QNS_BASE_URL).replace(/\/+$/, ''),
    timeoutMs: resolveTimeoutMs(opts.timeoutMs),
  };
}

interface Deadline {
  /** Hand this to `fetch`. Aborts on caller abort OR on the elapsed deadline. */
  signal: AbortSignal | undefined;
  /** True once the deadline fired, as opposed to the caller aborting. */
  expired: () => boolean;
  /** Always call, on every path. See the note on the returned `release`. */
  release: () => void;
}

/**
 * `timeoutMs` here is already normalised by {@link resolveTimeoutMs}: either
 * `NO_DEADLINE` or a finite positive number. Do NOT reintroduce a non-finite
 * check in this function — the safe interpretation of garbage is "use the
 * default", which only `resolveTimeoutMs` has the context to apply, and a
 * second guard here would silently start disabling deadlines again.
 */
function startDeadline(callerSignal: AbortSignal | undefined, timeoutMs: number): Deadline {
  // Opting out. Without this branch a `timeoutMs` of 0 would schedule an abort
  // on the next tick and fail every request, and the symptom — everything times
  // out instantly — reads like a dead resolver rather than a bad argument.
  if (timeoutMs <= NO_DEADLINE) {
    return { signal: callerSignal, expired: () => false, release: () => {} };
  }

  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);

  // The caller's signal and the deadline feed one controller, so an unmount and
  // an elapsed budget abort the same in-flight request.
  //
  // Built by hand rather than with `AbortSignal.any`, because the React Native
  // runtime does not have it: RN installs a global `AbortController` from the
  // `abort-controller` npm polyfill (`Libraries/Core/setUpXHR.js`), which
  // predates the static combinators and exposes no `any`. Desktop's Electron is
  // new enough that it would be fine — this is a portability floor set by
  // mobile, not by both. Hand-rolling costs six lines and needs no feature
  // detection.
  const forwardAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', forwardAbort);
  }

  return {
    signal: controller.signal,
    expired: () => expired,
    // An uncleared timer holds a Node process open past a fast response, and a
    // listener left on a long-lived caller signal accumulates one entry per
    // request. Neither shows up as a failing test on its own, which is why this
    // runs from a `finally` rather than the success path.
    release: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forwardAbort);
    },
  };
}

/**
 * A QNS response, with the body already read on the success path.
 *
 * The body is deliberately not exposed as a lazy `json()`: reading it later
 * would happen outside the deadline, and a stalled body stream is the same hang
 * one step further along.
 */
export type QnsResponse =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number };

/**
 * Issue one QNS request under a base URL and a deadline.
 *
 * `label` is what appears in a timeout message. It is a fixed string per call
 * site rather than the path, so a user-supplied name never lands in an error
 * that may be logged.
 *
 * The body is read only when the response is ok, matching what both callers did
 * before: a 404 or a 500 is decided from the status alone.
 */
export async function qnsRequest(
  path: string,
  init: RequestInit,
  input: QnsRequestInput | undefined,
  label: string,
): Promise<QnsResponse> {
  const { signal, baseUrl, timeoutMs } = normalizeRequestOptions(input);
  const deadline = startDeadline(signal, timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${path}`, { ...init, signal: deadline.signal });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, body: await res.json() };
  } catch (err) {
    // Report a timeout as its own error rather than letting the underlying
    // `AbortError` escape, so a dead resolver is legible as a dead resolver.
    //
    // What this does NOT do, despite the obvious guess: change how React Query
    // classifies it. MEASURED against the installed `@tanstack/query-core`
    // (5.90.12 here, 5.96.2 in desktop) — a rejection named `AbortError` and a
    // plain `Error` both settle the query as `status: 'error'`. React Query
    // detects cancellation via its OWN internal `CancelledError`, thrown when
    // it cancels a query itself; it never inspects `error.name`. An earlier
    // version of this comment claimed the query would sit in `pending`. It
    // does not.
    //
    // So the value here is diagnostic, not behavioural: "timed out after
    // 30000ms" names the cause, where "The operation was aborted" is the same
    // message a user navigating away produces. Worth keeping for logs and for
    // any caller that is not React Query — but do not let anyone argue it is
    // load-bearing for the fail-closed path, because it is not.
    if (deadline.expired()) {
      throw new Error(`QNS ${label} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    deadline.release();
  }
}
