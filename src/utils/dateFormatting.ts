/**
 * Calendar-based date/time formatting shared by desktop and mobile.
 *
 * Two canonical formatters, because in-message timestamps and list/row
 * timestamps want different shapes:
 *   - `formatMessageDate`      — the time shown on each message inside a chat.
 *   - `formatConversationTime` — the compact time on a conversation/list/feed row.
 *
 * Design notes:
 *   - The clock (12h vs 24h) is LOCALE-DRIVEN via `Intl.DateTimeFormat` — each
 *     device renders its regional convention. We deliberately do NOT hard-code
 *     24h, so an international audience sees the format they expect.
 *   - This module is i18n-agnostic: the few fixed words ("Today", "Yesterday",
 *     "at") are passed in by the caller via `labels`, defaulting to English.
 *     Each app supplies its own translated strings (desktop via lingui, mobile
 *     via its i18n). Weekday and relative strings ("Monday", "3 days ago")
 *     localize automatically through the dayjs locale the app has set.
 */

import dayjs from './dayjs';

/** Caller-supplied translations for the handful of fixed words. */
export interface MessageDateLabels {
  /** "Today" — used only in compact mode. */
  today?: string;
  /** "Yesterday". */
  yesterday?: string;
  /** "at" — the joiner in "Yesterday at 14:45". */
  at?: string;
}

const DEFAULT_LABELS: Required<MessageDateLabels> = {
  today: 'Today',
  yesterday: 'Yesterday',
  at: 'at',
};

/**
 * Locale-driven time-of-day, e.g. "14:45" or "2:45 PM" depending on the device
 * region. No `hour12` override → `Intl` picks the regional convention.
 */
function formatLocaleTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export interface FormatMessageDateOptions {
  labels?: MessageDateLabels;
  /**
   * Compact mode (mobile list use): omit the time for today/yesterday, showing
   * just the word. Today → "Today", Yesterday → "Yesterday".
   */
  compact?: boolean;
}

/**
 * Format a message timestamp using a calendar-relative format.
 *
 * Non-compact (default — per-message time inside a chat):
 *   - Today     → locale time ("14:45")
 *   - Yesterday → "Yesterday at 14:45"
 *   - Last week → weekday ("Monday")
 *   - Older     → relative ("3 days ago", "2 months ago")
 *
 * Compact (conversation-row use):
 *   - Today     → "Today"
 *   - Yesterday → "Yesterday"
 *   - Last week → weekday
 *   - Older     → relative
 *
 * @param timestamp Unix timestamp in milliseconds.
 */
export function formatMessageDate(
  timestamp: number,
  options: FormatMessageDateOptions = {},
): string {
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const time = dayjs(timestamp);
  const fromNow = time.fromNow();
  const timeStr = formatLocaleTime(time.toDate());

  if (options.compact) {
    return time.calendar(null, {
      sameDay: `[${labels.today}]`,
      lastDay: `[${labels.yesterday}]`,
      lastWeek: 'dddd',
      sameElse: `[${fromNow}]`,
    });
  }

  return time.calendar(null, {
    sameDay: `[${timeStr}]`,
    lastDay: `[${labels.yesterday} ${labels.at} ${timeStr}]`,
    lastWeek: 'dddd',
    sameElse: `[${fromNow}]`,
  });
}

/**
 * Format a timestamp for a conversation/list/feed row (compact).
 *
 *   - Today          → locale time ("14:45")
 *   - 1–6 days ago   → "1d" … "6d"
 *   - 7+ days, same year → short date ("Jun 28")
 *   - Different year → short date with year ("Jun 28, 2025")
 *
 * @param timestamp Unix timestamp in milliseconds.
 */
export function formatConversationTime(timestamp: number): string {
  const time = dayjs(timestamp);
  const now = dayjs();
  const daysDiff = now.startOf('day').diff(time.startOf('day'), 'day');

  if (daysDiff === 0) return formatLocaleTime(time.toDate());
  if (daysDiff >= 1 && daysDiff <= 6) return `${daysDiff}d`;
  if (time.year() !== now.year()) return time.format('MMM D, YYYY');
  return time.format('MMM D');
}
