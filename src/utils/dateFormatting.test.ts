import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  describeMessageDate,
  describeConversationTime,
  formatMessageDate,
  formatConversationTime,
} from './dateFormatting';

// Pin "now" to a fixed wall-clock so calendar buckets are deterministic.
// 2026-06-15 is a Monday; 14:45 local time.
const NOW = new Date(2026, 5, 15, 14, 45, 0);

// A timestamp N days before NOW at a given local hour:minute.
function daysBefore(days: number, hour = 14, minute = 45): number {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('describeMessageDate', () => {
  it('today → { kind: time }', () => {
    const p = describeMessageDate(daysBefore(0, 14, 45));
    expect(p.kind).toBe('time');
    if (p.kind === 'time') expect(p.time).toMatch(/45/);
  });

  it('yesterday → { kind: yesterday } with time', () => {
    const p = describeMessageDate(daysBefore(1, 9, 30));
    expect(p.kind).toBe('yesterday');
    if (p.kind === 'yesterday') expect(p.time).toMatch(/30/);
  });

  it('2–6 days → { kind: weekday } (localized name)', () => {
    // 3 days before Monday 2026-06-15 = Friday.
    const p = describeMessageDate(daysBefore(3));
    expect(p).toEqual({ kind: 'weekday', weekday: 'Friday' });
  });

  it('older → { kind: relative }', () => {
    const p = describeMessageDate(daysBefore(40));
    expect(p.kind).toBe('relative');
    if (p.kind === 'relative') expect(p.relative).toMatch(/ago$/);
  });
});

describe('formatMessageDate (string helper)', () => {
  it('today → locale time, no calendar words', () => {
    const out = formatMessageDate(daysBefore(0));
    expect(out).toMatch(/45/);
    expect(out).not.toMatch(/Yesterday|ago/);
  });

  it('yesterday → default "Yesterday at <time>"', () => {
    expect(formatMessageDate(daysBefore(1, 9, 30))).toMatch(/^Yesterday at .*30/);
  });

  it('custom yesterdayAt controls word order/wording', () => {
    const out = formatMessageDate(daysBefore(1, 9, 30), {
      labels: { yesterdayAt: (t) => `Ieri alle ${t}` },
    });
    expect(out).toMatch(/^Ieri alle .*30/);
  });

  it('compact today/yesterday use the labels, no time', () => {
    expect(formatMessageDate(daysBefore(0), { compact: true })).toBe('Today');
    expect(formatMessageDate(daysBefore(1), { compact: true })).toBe('Yesterday');
    expect(
      formatMessageDate(daysBefore(0), { compact: true, labels: { today: 'Oggi' } }),
    ).toBe('Oggi');
  });

  it('weekday / older pass through the describe output', () => {
    expect(formatMessageDate(daysBefore(3))).toBe('Friday');
    expect(formatMessageDate(daysBefore(40))).toMatch(/ago$/);
  });
});

describe('describeConversationTime', () => {
  it('today → { kind: time }', () => {
    const p = describeConversationTime(daysBefore(0));
    expect(p.kind).toBe('time');
  });

  it('1–6 days → { kind: daysAgo, days }', () => {
    expect(describeConversationTime(daysBefore(1))).toEqual({ kind: 'daysAgo', days: 1 });
    expect(describeConversationTime(daysBefore(6))).toEqual({ kind: 'daysAgo', days: 6 });
  });

  it('same year, 7+ days → { kind: shortDate } "MMM D"', () => {
    // 30 days before 2026-06-15 = 2026-05-16.
    expect(describeConversationTime(daysBefore(30))).toEqual({ kind: 'shortDate', date: 'May 16' });
  });

  it('different year → shortDate with year', () => {
    const p = describeConversationTime(daysBefore(200));
    expect(p.kind).toBe('shortDate');
    if (p.kind === 'shortDate') expect(p.date).toMatch(/, 2025$/);
  });
});

describe('formatConversationTime (string helper)', () => {
  it('renders time / Nd / short date', () => {
    expect(formatConversationTime(daysBefore(0))).toMatch(/45/);
    expect(formatConversationTime(daysBefore(3))).toBe('3d');
    expect(formatConversationTime(daysBefore(30))).toBe('May 16');
    expect(formatConversationTime(daysBefore(200))).toMatch(/, 2025$/);
  });
});
