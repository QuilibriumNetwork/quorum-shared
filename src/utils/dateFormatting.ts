/**
 * Calendar-based date/time description shared by desktop and mobile.
 *
 * Design: shared owns the CALENDAR LOGIC (which bucket a timestamp falls in, the
 * locale time-of-day, the localized weekday and relative strings). It does NOT
 * own the WORDING — it returns a structured, discriminated description and each
 * app composes the final localized sentence with its own i18n. This avoids
 * baking any word-order assumption (e.g. "Yesterday at 14:45") into shared,
 * which is wrong for some locales, and keeps shared free of any i18n dependency.
 *
 * Two describers, because in-message timestamps and list/row timestamps want
 * different shapes:
 *   - `describeMessageDate`      — the time shown on each message inside a chat.
 *   - `describeConversationTime` — the compact time on a conversation/list/feed row.
 *
 * Thin string helpers (`formatMessageDate` / `formatConversationTime`) are
 * provided for callers that just want a string and are fine with simple
 * label substitution; anything needing real localization should consume the
 * `describe*` output directly.
 *
 * The clock (12h vs 24h) is LOCALE-DRIVEN via `Intl.DateTimeFormat` — each
 * device renders its regional convention. We deliberately do NOT hard-code 24h.
 */

import dayjs from './dayjs';

/**
 * Structured description of a message timestamp. Discriminated by `kind`:
 *   - `time`     → today; render just `time`.
 *   - `yesterday`→ render "yesterday" + `time` (app decides the joiner/word order).
 *   - `weekday`  → within the last week; render `weekday` (already localized).
 *   - `relative` → older; render `relative` (already localized, e.g. "3 days ago").
 *
 * `time` is the locale-formatted time-of-day (e.g. "14:45" or "2:45 PM"),
 * present on the `time` and `yesterday` kinds so the app never re-derives it.
 */
export type MessageDateParts =
  | { kind: 'time'; time: string }
  | { kind: 'yesterday'; time: string }
  | { kind: 'weekday'; weekday: string }
  | { kind: 'relative'; relative: string };

/**
 * Structured description of a conversation/list/feed timestamp. Discriminated:
 *   - `time`      → today; render `time`.
 *   - `daysAgo`   → 1–6 days ago; render `days` (app picks the unit, e.g. "3d").
 *   - `shortDate` → 7+ days; render `date` ("Jun 28" or "Jun 28, 2025").
 */
export type ConversationTimeParts =
  | { kind: 'time'; time: string }
  | { kind: 'daysAgo'; days: number }
  | { kind: 'shortDate'; date: string };

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

/**
 * Describe a message timestamp for in-chat display. See `MessageDateParts`.
 *
 * Buckets:
 *   - Today     → { kind: 'time' }
 *   - Yesterday → { kind: 'yesterday' }
 *   - Last week → { kind: 'weekday' } (localized via the app's dayjs locale)
 *   - Older     → { kind: 'relative' } (localized, e.g. "3 days ago")
 *
 * @param timestamp Unix timestamp in milliseconds.
 */
export function describeMessageDate(timestamp: number): MessageDateParts {
  const time = dayjs(timestamp);
  const now = dayjs();
  const daysDiff = now.startOf('day').diff(time.startOf('day'), 'day');

  if (daysDiff === 0) return { kind: 'time', time: formatLocaleTime(time.toDate()) };
  if (daysDiff === 1) return { kind: 'yesterday', time: formatLocaleTime(time.toDate()) };
  if (daysDiff >= 2 && daysDiff <= 6) return { kind: 'weekday', weekday: time.format('dddd') };
  return { kind: 'relative', relative: time.fromNow() };
}

/**
 * Describe a conversation/list/feed timestamp. See `ConversationTimeParts`.
 *
 * Buckets:
 *   - Today          → { kind: 'time' }
 *   - 1–6 days ago   → { kind: 'daysAgo', days }
 *   - 7+ days        → { kind: 'shortDate' } ("Jun 28" or "Jun 28, 2025")
 *
 * @param timestamp Unix timestamp in milliseconds.
 */
export function describeConversationTime(timestamp: number): ConversationTimeParts {
  const time = dayjs(timestamp);
  const now = dayjs();
  const daysDiff = now.startOf('day').diff(time.startOf('day'), 'day');

  if (daysDiff === 0) return { kind: 'time', time: formatLocaleTime(time.toDate()) };
  if (daysDiff >= 1 && daysDiff <= 6) return { kind: 'daysAgo', days: daysDiff };
  const date =
    time.year() !== now.year() ? time.format('MMM D, YYYY') : time.format('MMM D');
  return { kind: 'shortDate', date };
}

/** Caller-supplied words for the string helper. English defaults. */
export interface MessageDateLabels {
  /** "Today" — used only in compact mode. */
  today?: string;
  /** "Yesterday". */
  yesterday?: string;
  /**
   * Builds the yesterday-with-time string. Default: `Yesterday at 14:45`.
   * Override to control word order/wording for a locale.
   */
  yesterdayAt?: (time: string) => string;
}

export interface FormatMessageDateOptions {
  labels?: MessageDateLabels;
  /** Omit the time for today/yesterday, showing just the word (list use). */
  compact?: boolean;
}

/**
 * Convenience string form of {@link describeMessageDate}. Fine for English or
 * simple label substitution; for full localization compose from the parts
 * directly (word order for "yesterday at X" varies by language — override
 * `labels.yesterdayAt` or use `describeMessageDate`).
 */
export function formatMessageDate(
  timestamp: number,
  options: FormatMessageDateOptions = {},
): string {
  const today = options.labels?.today ?? 'Today';
  const yesterday = options.labels?.yesterday ?? 'Yesterday';
  const yesterdayAt = options.labels?.yesterdayAt ?? ((time: string) => `${yesterday} at ${time}`);

  const parts = describeMessageDate(timestamp);
  switch (parts.kind) {
    case 'time':
      return options.compact ? today : parts.time;
    case 'yesterday':
      return options.compact ? yesterday : yesterdayAt(parts.time);
    case 'weekday':
      return parts.weekday;
    case 'relative':
      return parts.relative;
  }
}

/**
 * Convenience string form of {@link describeConversationTime}. The `Nd` unit is
 * ASCII and rarely translated; override by consuming the parts if needed.
 */
export function formatConversationTime(timestamp: number): string {
  const parts = describeConversationTime(timestamp);
  switch (parts.kind) {
    case 'time':
      return parts.time;
    case 'daysAgo':
      return `${parts.days}d`;
    case 'shortDate':
      return parts.date;
  }
}
