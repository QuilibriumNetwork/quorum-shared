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
