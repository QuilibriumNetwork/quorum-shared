import { qnsRequest, type QnsRequestOptions } from './transport';

// Re-exported here rather than from `./transport` directly, because `./index`
// re-exports this module and `transport` holds internals (`qnsRequest`, the
// deadline plumbing) that are not part of the package's surface. Listing the
// public names explicitly keeps that line where it is meant to be.
export {
  QNS_BASE_URL,
  QNS_DEFAULT_TIMEOUT_MS,
  type QnsRequestOptions,
  type QnsRequestInput,
} from './transport';

/**
 * Minimal QNS name record — only the fields the username feature consumes.
 * The full QNS record (mobile's `qnsClient.ts`) carries header/metadata/
 * ownership, but resolution-for-display needs only the resolved address and
 * the public key used to derive it.
 */
export interface QnsNameRecord {
  /** The Qm… address the name's owner published. */
  address: string;
  /** Hex-encoded ed448 public key (57 bytes). Present when the name is
   *  publicly resolvable; absent for privacy-stealth-only records. */
  resolveKey?: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Resolve a single QNS name to its record. Returns null when the name is not
 * registered (404). Throws on other transport/server errors so callers can
 * distinguish "no such name" from "lookup failed". This is the ONLY QNS
 * endpoint the username feature needs — registration/marketplace are excluded.
 *
 * `opts` carries the base URL, the request deadline and an abort signal; see
 * `QnsRequestOptions`. Omitting it means the production resolver under the
 * default deadline.
 *
 * Unlike `resolveNamesBatch`, this does NOT accept a bare `AbortSignal`. That
 * asymmetry is deliberate: the batch entry point carries the union only to keep
 * desktop's existing `resolveNamesBatch(names, signal)` call site compiling, and
 * nothing calls this one that way. Writing `resolveName(name, signal)` here is a
 * compile error (`TS2559`), which is the loud failure you want — see the note
 * on `QnsRequestInput`.
 */
export async function resolveName(
  name: string,
  opts?: QnsRequestOptions,
): Promise<QnsNameRecord | null> {
  const res = await qnsRequest(
    `/resolve/${encodeURIComponent(name)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    opts,
    'resolve',
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`QNS resolve failed: ${res.status}`);
  }
  return res.body as QnsNameRecord;
}
