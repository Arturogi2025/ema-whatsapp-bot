import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock modules that create clients at import time
vi.mock('../lib/supabase', () => ({
  getSupabaseAdmin: () => ({}),
}));
vi.mock('../lib/whatsapp', () => ({
  sendTemplateMessage: vi.fn(),
  sendTextMessage: vi.fn(),
}));
vi.mock('../lib/email', () => ({
  notifyFollowupFailure: vi.fn(),
}));
vi.mock('../lib/push', () => ({
  pushFollowupFailure: vi.fn(),
}));

import { parseMeetingTime } from '../api/cron/send-reminders';

/**
 * Tests for parseMeetingTime — the cron job's datetime parser.
 * Must handle both new ISO format and legacy Spanish text format.
 */

const FIXED_NOW = new Date('2026-04-09T16:00:00.000Z'); // Wed Apr 9, 2026

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('parseMeetingTime', () => {
  // ── New ISO format (from resolveToAbsoluteDate) ──
  describe('ISO 8601 format', () => {
    it('parses "2026-04-10T15:00:00-06:00"', () => {
      const result = parseMeetingTime('2026-04-10T15:00:00-06:00');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      // The exact hour depends on local timezone, but the Date object should be valid
      expect(result!.getTime()).toBeGreaterThan(0);
    });

    it('parses "2026-04-15T11:00:00-06:00"', () => {
      const result = parseMeetingTime('2026-04-15T11:00:00-06:00');
      expect(result).not.toBeNull();
    });

    it('parses ISO without offset "2026-04-10T15:00:00"', () => {
      const result = parseMeetingTime('2026-04-10T15:00:00');
      expect(result).not.toBeNull();
    });
  });

  // ── Legacy text format ──
  describe('Legacy Spanish text format', () => {
    it('parses "10 de abril a las 3pm"', () => {
      const result = parseMeetingTime('10 de abril a las 3pm');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(3); // April = 3
      expect(result!.getDate()).toBe(10);
      expect(result!.getHours()).toBe(15);
    });

    it('parses "15 de mayo a las 11am"', () => {
      const result = parseMeetingTime('15 de mayo a las 11am');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(4); // May = 4
      expect(result!.getHours()).toBe(11);
    });

    it('parses time with "de la tarde" qualifier', () => {
      const result = parseMeetingTime('10 de abril a las 3 de la tarde');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(15);
    });

    it('parses "medio día" / "mediodía"', () => {
      const result = parseMeetingTime('10 de abril al medio día');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(12);
    });

    it('parses "mediodía" (single word)', () => {
      const result = parseMeetingTime('10 de abril mediodía');
      // mediodía without "a las" — parser should still detect the time
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(12);
    });
  });

  // ── Time-only (no date — assumes today/tomorrow) ──
  describe('Time-only parsing', () => {
    it('parses "3pm" (time only, assumes next occurrence)', () => {
      const result = parseMeetingTime('a las 3pm');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(15);
    });

    it('parses "11am"', () => {
      const result = parseMeetingTime('a las 11am');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(11);
    });

    it('simple time "las 3" assumes PM for hours 1-7', () => {
      const result = parseMeetingTime('las 3');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(15);
    });
  });

  // ── Unparseable ──
  describe('Unparseable input', () => {
    it('returns null for garbage text', () => {
      const result = parseMeetingTime('asdfghjkl');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = parseMeetingTime('');
      expect(result).toBeNull();
    });

    it('returns null for just a name', () => {
      const result = parseMeetingTime('Mario García');
      expect(result).toBeNull();
    });
  });

  // ── Past dates roll to next year ──
  describe('Past date handling', () => {
    it('rolls past date to next year', () => {
      // January 5 is in the past (we're in April), should go to 2027
      const result = parseMeetingTime('5 de enero a las 10am');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2027);
    });
  });
});
