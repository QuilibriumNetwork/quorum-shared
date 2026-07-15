import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatMessageDate, formatConversationTime } from './dateFormatting';

// Pin "now" to a fixed wall-clock so calendar()/fromNow() are deterministic.
// 2026-06-15 14:45 local time.
const NOW = new Date(2026, 5, 15, 14, 45, 0);

// Build a timestamp N days before NOW, at a given local hour:minute.
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

describe('formatMessageDate', () => {
  it('today → locale time only (no date words)', () => {
    const out = formatMessageDate(daysBefore(0, 14, 45));
    // Locale-driven clock: assert it contains the minute and no calendar word.
    expect(out).toMatch(/45/);
    expect(out).not.toMatch(/Yesterday|ago/);
  });

  it('yesterday → "Yesterday at <time>"', () => {
    const out = formatMessageDate(daysBefore(1, 9, 30));
    expect(out).toMatch(/^Yesterday at /);
    expect(out).toMatch(/30/);
  });

  it('last week → weekday name', () => {
    // 3 days before a Monday(2026-06-15) is Friday.
    const out = formatMessageDate(daysBefore(3));
    expect(out).toBe('Friday');
  });

  it('older → relative ("... ago")', () => {
    const out = formatMessageDate(daysBefore(40));
    expect(out).toMatch(/ago$/);
  });

  it('uses caller labels for the fixed words', () => {
    const out = formatMessageDate(daysBefore(1, 9, 30), {
      labels: { yesterday: 'Ieri', at: 'alle' },
    });
    expect(out).toMatch(/^Ieri alle /);
  });

  describe('compact mode', () => {
    it('today → the "Today" label, no time', () => {
      const out = formatMessageDate(daysBefore(0), { compact: true });
      expect(out).toBe('Today');
    });

    it('yesterday → the "Yesterday" label, no time', () => {
      const out = formatMessageDate(daysBefore(1), { compact: true });
      expect(out).toBe('Yesterday');
    });

    it('honors compact labels', () => {
      expect(
        formatMessageDate(daysBefore(0), { compact: true, labels: { today: 'Oggi' } }),
      ).toBe('Oggi');
    });
  });
});

describe('formatConversationTime', () => {
  it('today → locale time', () => {
    const out = formatConversationTime(daysBefore(0, 14, 45));
    expect(out).toMatch(/45/);
    expect(out).not.toMatch(/d$/);
  });

  it('1–6 days ago → "Nd"', () => {
    expect(formatConversationTime(daysBefore(1))).toBe('1d');
    expect(formatConversationTime(daysBefore(6))).toBe('6d');
  });

  it('7+ days, same year → "MMM D"', () => {
    const out = formatConversationTime(daysBefore(30));
    // 30 days before 2026-06-15 = 2026-05-16.
    expect(out).toBe('May 16');
  });

  it('different year → "MMM D, YYYY"', () => {
    const out = formatConversationTime(daysBefore(200));
    // 200 days before 2026-06-15 lands in 2025.
    expect(out).toMatch(/, 2025$/);
  });
});
