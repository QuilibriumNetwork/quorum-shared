/**
 * Batched name resolution.
 *
 * The batch endpoint is what makes verification affordable at all: mobile
 * measured a 100-name batch at ~190ms against ~167ms for a single name, so a
 * whole screenful of claimants costs about the same as one. Without it, a
 * verified roster would mean one request per row, which is the fetch storm both
 * clients have already refused once.
 *
 * The limits asserted here are MEASURED against the live API (2026-08-16):
 *
 * - 100 names  -> HTTP 200
 * - 101 names  -> HTTP 400, `{"success":false,"error":{"code":"BATCH_SIZE_EXCEEDED"}}`
 * - a name that is not registered comes back as a `null` slot at HTTP 200,
 *   NOT as a 404
 *
 * The 101 behaviour is why chunking is not an optimisation: an oversized batch
 * fails as a WHOLE, so one extra claimant on screen would unverify everybody,
 * not just the overflow.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveNamesBatch, QNS_BATCH_LIMIT } from './resolveBatch';
import { QNS_BASE_URL } from './resolver';

afterEach(() => vi.restoreAllMocks());

const okResponse = (records: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ records }),
});

/** Bodies of the POSTs a mock received, parsed. */
const bodiesOf = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));

describe('QNS_BATCH_LIMIT', () => {
  it('is 100, the measured server maximum', () => {
    // Hard-coded rather than derived: this number is a property of the server,
    // and if it ever changes the test should fail loudly rather than adapt.
    expect(QNS_BATCH_LIMIT).toBe(100);
  });
});

describe('resolveNamesBatch', () => {
  it('POSTs the names and keys the records by name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse([{ address: '0x1', resolveKey: 'aa' }, null]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await resolveNamesBatch(['alice', 'nobody']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${QNS_BASE_URL}/resolve/batch`);
    expect(bodiesOf(fetchMock)[0]).toEqual({ names: ['alice', 'nobody'] });
    expect(out.alice?.resolveKey).toBe('aa');
    expect(out.nobody).toBeNull();
  });

  it('passes an abort signal through to fetch', async () => {
    // So a caller can abandon a superseded lookup. Without it, a request made
    // obsolete by a widening claim set still runs to completion and its answer
    // is discarded.
    const fetchMock = vi.fn().mockResolvedValue(okResponse([{ resolveKey: 'aa' }]));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    await resolveNamesBatch(['alice'], controller.signal);

    expect((fetchMock.mock.calls[0][1] as { signal?: AbortSignal }).signal).toBe(
      controller.signal,
    );
  });

  it('works without a signal, which stays optional', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([{ resolveKey: 'aa' }]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(resolveNamesBatch(['alice'])).resolves.toBeTruthy();
  });

  it('makes no request at all for an empty list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveNamesBatch([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chunks at the limit so an oversized batch cannot fail as a whole', async () => {
    // 101 names in ONE request is a 400 that loses all 101. Two requests of
    // 100 + 1 lose nothing. This is the test that keeps the chunking honest.
    const names = Array.from({ length: 101 }, (_, i) => `n${i}`);
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      const { names: sent } = JSON.parse((init as { body: string }).body);
      return Promise.resolve(okResponse(sent.map((n: string) => ({ resolveKey: n }))));
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await resolveNamesBatch(names);

    const bodies = bodiesOf(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies[0].names).toHaveLength(100);
    expect(bodies[1].names).toHaveLength(1);
    expect(Object.keys(out)).toHaveLength(101);
    expect(out.n100?.resolveKey).toBe('n100');
  });

  it('deduplicates before chunking', async () => {
    // Two spacemates claiming the same name is one lookup, not two. Without
    // this, 101 rows claiming one name would trip the server limit.
    const fetchMock = vi.fn().mockResolvedValue(okResponse([{ resolveKey: 'aa' }]));
    vi.stubGlobal('fetch', fetchMock);

    const out = await resolveNamesBatch(['alice', 'alice', 'alice']);

    expect(bodiesOf(fetchMock)[0]).toEqual({ names: ['alice'] });
    expect(out.alice?.resolveKey).toBe('aa');
  });

  it('ignores blank names without sending them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([{ resolveKey: 'aa' }]));
    vi.stubGlobal('fetch', fetchMock);

    await resolveNamesBatch(['alice', '', '   ']);

    expect(bodiesOf(fetchMock)[0]).toEqual({ names: ['alice'] });
  });

  it('throws when the server errors, rather than reporting every name unresolved', async () => {
    // Critical, and the reason this cannot just swallow errors: the caller
    // caches this result for an hour. Returning "no record" for a transient
    // network blip would strip the `.q` from every legitimate owner for that
    // hour. Throwing leaves the cache empty instead, so nothing verifies for
    // this render and the next attempt refetches.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(resolveNamesBatch(['alice'])).rejects.toThrow();
  });

  it('throws on a 400, including BATCH_SIZE_EXCEEDED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(resolveNamesBatch(['alice'])).rejects.toThrow();
  });

  it('throws when the server returns a mismatched number of records', async () => {
    // Records are matched to names POSITIONALLY, so a short or long array
    // would silently attribute one account's key to another account's name —
    // exactly the impersonation this whole feature exists to prevent. There is
    // no safe way to guess the alignment, so refuse.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([{ resolveKey: 'aa' }])));
    await expect(resolveNamesBatch(['alice', 'bob'])).rejects.toThrow(/records/i);
  });

  it('throws when the server omits the records array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));
    await expect(resolveNamesBatch(['alice'])).rejects.toThrow();
  });
});
