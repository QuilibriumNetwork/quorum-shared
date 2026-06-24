/**
 * Text formatting utilities
 */

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Truncate a Quilibrium address for display.
 *
 * Every Quilibrium address is a CIDv0 ("Qm" + 44 base58 chars); the "Qm"
 * prefix is a constant multihash header (0x12 0x20) and carries ZERO entropy.
 * We keep "Qm" visible (brand recognizability) but do NOT spend the `start`
 * budget on it — `start` counts MEANINGFUL chars after the prefix. This yields
 * a true `start + end`-char discriminating anchor, which matters for resisting
 * address-grinding/impersonation. Defaults (6/6) give a 12-char anchor.
 *
 * Truncation is a disambiguation + anti-grind label, NOT identity proof —
 * surface the full address for real trust decisions.
 *
 * @param address  Full address (or @username, returned verbatim).
 * @param start    Meaningful leading chars to show AFTER the Qm prefix. Default 6.
 * @param end      Trailing chars to show. Default 6.
 */
export function formatAddress(
  address: string | undefined | null,
  start = 6,
  end = 6,
): string {
  if (!address) return '';
  if (address.startsWith('@')) return address; // username passthrough

  // 'Qm' = constant CIDv0 multihash prefix → zero entropy. Keep it visible,
  // but don't count it toward `start`.
  const hasQm = address.startsWith('Qm');
  const head = hasQm ? 2 : 0;

  // If too short to truncate meaningfully, return as-is.
  if (address.length <= head + start + end + 1) return address;

  return `${address.slice(0, head + start)}…${address.slice(-end)}`;
}

/**
 * Format file size (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format member count (e.g., "1.2K members")
 */
export function formatMemberCount(count: number): string {
  if (count < 1000) {
    return `${count} member${count === 1 ? '' : 's'}`;
  }
  if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K members`;
  }
  return `${(count / 1000000).toFixed(1)}M members`;
}

/**
 * Format timestamp to date string (e.g., "Dec 24, 2025")
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format relative time (e.g., "Just now", "5 minutes ago", "Yesterday")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days} days ago`;
  }

  return formatDate(timestamp);
}
