export const QNS_BASE_URL = 'https://names.quilibrium.com';

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
 */
export async function resolveName(name: string): Promise<QnsNameRecord | null> {
  const res = await fetch(`${QNS_BASE_URL}/resolve/${encodeURIComponent(name)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`QNS resolve failed: ${res.status}`);
  return (await res.json()) as QnsNameRecord;
}
