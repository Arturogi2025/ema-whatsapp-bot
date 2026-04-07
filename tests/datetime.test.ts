import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { extractDatetime, resolveToAbsoluteDate } from '../lib/ai-handler';

/**
 * Datetime tests need a fixed "now" to produce deterministic results.
 * We mock Date to be Wednesday April 9, 2026 at 10:00 AM Mexico City time.
 * Mexico City is UTC-6 (CDT in April), so that's 16:00 UTC.
 */
const FIXED_NOW = new Date('2026-04-09T16:00:00.000Z'); // Wed Apr 9, 2026 10:00 AM CDMX

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ════════════════════════════════════════════════════
// resolveToAbsoluteDate — converts relative text to ISO
// ════════════════════════════════════════════════════

describe('resolveToAbsoluteDate', () => {
  describe('Relative day resolution', () => {
    it('"mañana a las 3pm" → Thursday April 10 at 15:00', () => {
      const result = resolveToAbsoluteDate('mañana a las 3pm');
      expect(result).toMatch(/^2026-04-10T15:00:00/);
    });

    it('"hoy a las 5pm" → today (April 9) at 17:00', () => {
      const result = resolveToAbsoluteDate('hoy a las 5pm');
      expect(result).toMatch(/^2026-04-09T17:00:00/);
    });

    it('"pasado mañana a las 11am" → Friday April 11 at 11:00', () => {
      const result = resolveToAbsoluteDate('pasado mañana a las 11am');
      expect(result).toMatch(/^2026-04-11T11:00:00/);
    });

    it('"tomorrow at 2pm" → Thursday April 10 at 14:00', () => {
      const result = resolveToAbsoluteDate('tomorrow at 2pm');
      expect(result).toMatch(/^2026-04-10T14:00:00/);
    });
  });

  describe('Day name resolution (next occurrence)', () => {
    it('"el jueves a las 3pm" → resolves to a Thursday at 15:00', () => {
      const result = resolveToAbsoluteDate('el jueves a las 3pm');
      // Should be a future date at 15:00
      expect(result).toContain('T15:00:00');
      // Must be after our mocked "now"
      expect(new Date(result).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
    });

    it('"el viernes a las 10am" → resolves to a Friday at 10:00', () => {
      const result = resolveToAbsoluteDate('el viernes a las 10am');
      expect(result).toContain('T10:00:00');
      expect(new Date(result).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
    });

    it('"el lunes a las 9am" → resolves to a Monday at 09:00', () => {
      const result = resolveToAbsoluteDate('el lunes a las 9am');
      expect(result).toContain('T09:00:00');
      expect(new Date(result).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
    });

    it('"monday at 3pm" in English → resolves to a Monday at 15:00', () => {
      const result = resolveToAbsoluteDate('monday at 3pm');
      expect(result).toContain('T15:00:00');
      expect(new Date(result).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
    });
  });

  describe('Explicit date resolution', () => {
    it('"15 de abril a las 3 de la tarde" → April 15 at 15:00', () => {
      const result = resolveToAbsoluteDate('15 de abril a las 3 de la tarde');
      expect(result).toMatch(/^2026-04-15T15:00:00/);
    });

    it('"10 de mayo a las 10am" → May 10 at 10:00', () => {
      const result = resolveToAbsoluteDate('10 de mayo a las 10am');
      expect(result).toMatch(/^2026-05-10T10:00:00/);
    });
  });

  describe('Time resolution', () => {
    it('"3pm" resolves to 15:00', () => {
      const result = resolveToAbsoluteDate('mañana a las 3pm');
      expect(result).toContain('T15:00:00');
    });

    it('"11am" resolves to 11:00', () => {
      const result = resolveToAbsoluteDate('mañana a las 11am');
      expect(result).toContain('T11:00:00');
    });

    it('"8:30pm" resolves to 20:30', () => {
      const result = resolveToAbsoluteDate('mañana a las 8:30pm');
      expect(result).toContain('T20:30:00');
    });

    it('"a las 3 de la tarde" → 15:00', () => {
      const result = resolveToAbsoluteDate('mañana a las 3 de la tarde');
      expect(result).toContain('T15:00:00');
    });

    it('"a las 10 de la mañana" → 10:00', () => {
      const result = resolveToAbsoluteDate('mañana a las 10 de la mañana');
      expect(result).toContain('T10:00:00');
    });

    it('"al medio día" → 12:00', () => {
      const result = resolveToAbsoluteDate('mañana al medio día');
      expect(result).toContain('T12:00:00');
    });

    it('"mediodía" → 12:00', () => {
      const result = resolveToAbsoluteDate('el viernes mediodía');
      expect(result).toContain('T12:00:00');
    });

    it('"a las 3" without qualifier → assumes PM (15:00) for 1-7', () => {
      const result = resolveToAbsoluteDate('mañana a las 3');
      expect(result).toContain('T15:00:00');
    });

    it('"a las 10" without qualifier → stays 10:00 (not ambiguous)', () => {
      const result = resolveToAbsoluteDate('mañana a las 10');
      expect(result).toContain('T10:00:00');
    });

    it('"por la tarde" without specific time → defaults to 15:00', () => {
      const result = resolveToAbsoluteDate('mañana por la tarde');
      expect(result).toContain('T15:00:00');
    });

    it('"por la noche" without specific time → defaults to 19:00', () => {
      const result = resolveToAbsoluteDate('mañana por la noche');
      expect(result).toContain('T19:00:00');
    });
  });

  describe('Output format', () => {
    it('returns ISO 8601 with timezone offset', () => {
      const result = resolveToAbsoluteDate('mañana a las 3pm');
      // Should match format: YYYY-MM-DDTHH:mm:00±HH:00
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:00$/);
    });

    it('includes Mexico City offset (-06:00 or -05:00)', () => {
      const result = resolveToAbsoluteDate('mañana a las 3pm');
      // Mexico City is UTC-6 (CST) or UTC-5 (CDT)
      expect(result).toMatch(/[+-]0[56]:00$/);
    });
  });
});

// ════════════════════════════════════════════════════
// extractDatetime — extracts datetime from natural text
// ════════════════════════════════════════════════════

describe('extractDatetime', () => {
  describe('Spanish datetime extraction', () => {
    it('extracts "el jueves a las 3pm"', () => {
      const result = extractDatetime('Perfecto, el jueves a las 3pm me funciona');
      expect(result).not.toBeNull();
      expect(result).toContain('T15:00:00');
    });

    it('extracts "mañana a las 11am"', () => {
      const result = extractDatetime('Sí, mañana a las 11am estaría bien');
      expect(result).not.toBeNull();
      expect(result).toContain('T11:00:00');
    });

    it('extracts "el viernes al medio día"', () => {
      const result = extractDatetime('El viernes al medio día puedo');
      expect(result).not.toBeNull();
      expect(result).toContain('T12:00:00');
    });

    it('extracts "15 de abril a las 3 de la tarde"', () => {
      const result = extractDatetime('Podría ser el 15 de abril a las 3 de la tarde');
      expect(result).not.toBeNull();
      expect(result).toMatch(/^2026-04-15T15:00:00/);
    });

    it('extracts "mañana por la tarde"', () => {
      const result = extractDatetime('Mañana por la tarde me va bien');
      expect(result).not.toBeNull();
    });

    it('extracts standalone day "el lunes"', () => {
      const result = extractDatetime('El lunes estaría bien');
      expect(result).not.toBeNull();
    });

    it('extracts "3pm" standalone', () => {
      const result = extractDatetime('A las 3pm');
      expect(result).not.toBeNull();
    });
  });

  describe('No datetime in message', () => {
    it('returns null for "Hola, necesito una página web"', () => {
      const result = extractDatetime('Hola, necesito una página web');
      expect(result).toBeNull();
    });

    it('returns null for "Cuánto cuesta?"', () => {
      const result = extractDatetime('Cuánto cuesta?');
      expect(result).toBeNull();
    });

    it('returns null for "Tengo 12 empleados"', () => {
      const result = extractDatetime('Tengo 12 empleados');
      expect(result).toBeNull();
    });
  });

  describe('Real conversation examples (from CRM)', () => {
    it('extracts from "El día de hoy al medio día"', () => {
      const result = extractDatetime('El día de hoy al medio día');
      expect(result).not.toBeNull();
      expect(result).toContain('T12:00:00');
    });

    it('extracts from "Mañana a las 11 de la mañana"', () => {
      const result = extractDatetime('Mañana a las 11 de la mañana');
      expect(result).not.toBeNull();
      expect(result).toContain('T11:00:00');
    });
  });
});
