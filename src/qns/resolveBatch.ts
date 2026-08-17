/**
 * Resolve many QNS names in one request.
 *
 * Verifying a claimed `.q` means resolving the claimed name and comparing the
 * derived address to the claimant's (see `claimedNameBelongsTo`). Doing that
 * one name at a time would mean one request per roster row, on a roster whose
 * size is bounded by nothing the user did — the fetch storm both clients have
 * already refused once.
 *
 * Batching is what makes it affordable: mobile measured a 100-name batch at
 * ~190ms against ~167ms for a single name, so a screenful of claimants costs
 * about what one costs.
 *
 * ## Measured server behaviour (2026-08-16, live API)
 *
 * - `POST /resolve/batch` with `{names: [...]}` returns `{records: [...]}`,
 *   aligned POSITIONALLY with the names sent.
 * - An unregistered name is a `null` slot at HTTP 200, not a 404.
 * - 100 names is accepted; 101 is rejected with HTTP 400
 *   `{"error":{"code":"BATCH_SIZE_EXCEEDED"}}` — and the rejection covers the
 *   WHOLE request, so one claimant over the line would unverify everybody on
 *   screen rather than just the overflow. That is why chunking here is a
 *   correctness measure and not a performance tweak.
 */

import { type QnsNameRecord } from './resolver';
import { qnsRequest, type QnsRequestInput } from './transport';

/**
 * Server maximum for one `/resolve/batch` request. MEASURED, not documented:
 * 100 returns 200 and 101 returns `BATCH_SIZE_EXCEEDED`. If the server ever
 * changes this, the test asserting the constant should fail loudly rather than
 * quietly adapt.
 */
export const QNS_BATCH_LIMIT = 100;

/** `name -> record`, with `null` for a name the resolver does not know. */
export type QnsBatchResult = Record<string, QnsNameRecord | null>;

/**
 * Resolve `names` and return them keyed by name.
 *
 * Blank entries are dropped and duplicates are collapsed, so callers can pass a
 * raw column of claims straight from a roster without pre-cleaning it.
 *
 * `opts` is optional. It accepts either a `QnsRequestOptions` object — base
 * URL, request deadline, abort signal — or a bare `AbortSignal`, which is the
 * form desktop already calls with.
 *
 * A React Query caller should pass the `signal` from its query context: when a
 * widening claim set makes an in-flight request obsolete, without this the old
 * request still runs to completion and its answer is thrown away. That signal
 * does not bound elapsed time, which is what the deadline is for — the two
 * compose, see `qnsRequest`.
 *
 * ## Each chunk gets its own deadline
 *
 * The chunks below are sequential requests, and the deadline applies to each
 * one rather than to the call as a whole. A large roster therefore has no fixed
 * upper bound on total time; see the reasoning in `transport.ts`.
 *
 * ## Throws rather than degrading, on purpose
 *
 * Any transport or server failure rejects. It would be easy to return "no
 * record" for the failed names instead, and that would be wrong: callers cache
 * this for an hour, so a single transient blip would strip the `.q` from every
 * legitimate owner for that hour, with nothing logged and no way for the user
 * to tell it apart from the feature being broken. Rejecting leaves the cache
 * empty — nothing verifies for that render, which is the correct fail-closed
 * outcome — and the next attempt refetches.
 */
export async function resolveNamesBatch(
  names: string[],
  opts?: QnsRequestInput,
): Promise<QnsBatchResult> {
  const unique = Array.from(
    new Set(names.map((n) => (n ?? '').trim()).filter((n) => n.length > 0)),
  );
  if (unique.length === 0) return {};

  const out: QnsBatchResult = {};
  for (let i = 0; i < unique.length; i += QNS_BATCH_LIMIT) {
    const chunk = unique.slice(i, i + QNS_BATCH_LIMIT);
    const records = await postBatch(chunk, opts);
    chunk.forEach((name, index) => {
      out[name] = records[index] ?? null;
    });
  }
  return out;
}

async function postBatch(
  names: string[],
  opts?: QnsRequestInput,
): Promise<(QnsNameRecord | null)[]> {
  const res = await qnsRequest(
    '/resolve/batch',
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    },
    opts,
    'resolve/batch',
  );
  if (!res.ok) {
    throw new Error(`QNS batch resolve failed: ${res.status}`);
  }

  const body = res.body as { records?: (QnsNameRecord | null)[] };
  const records = body?.records;
  if (!Array.isArray(records)) {
    throw new Error('QNS batch resolve returned no records array');
  }

  // Positional alignment is the ONLY thing tying a record to a name, so a
  // length mismatch means every pairing after the first divergence could
  // attribute one account's key to another account's name. That is precisely
  // the impersonation this feature exists to prevent, and there is no safe way
  // to guess the intended alignment — so refuse the whole response.
  if (records.length !== names.length) {
    throw new Error(
      `QNS batch resolve returned ${records.length} records for ${names.length} names`,
    );
  }

  return records;
}
