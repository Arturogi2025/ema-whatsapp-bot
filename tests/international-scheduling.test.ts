import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectTimezoneFromPhone,
  buildTimezoneContext,
  needsTimezonesClarification,
  buildTimezoneSchedulingNudge,
  convertClientTimeToMexico,
} from '../lib/timezone';
import { detectIntent, extractDatetime } from '../lib/ai-handler';

// ════════════════════════════════════════════════════
// needsTimezonesClarification
// ════════════════════════════════════════════════════

describe('needsTimezonesClarification', () => {
  it('returns false for Mexican numbers (same timezone)', () => {
    expect(needsTimezonesClarification('+5215512345678')).toBe(false);
  });

  it('returns false for Guatemala (same timezone as Mexico)', () => {
    expect(needsTimezonesClarification('+50212345678')).toBe(false);
  });

  it('returns false for El Salvador (same timezone as Mexico)', () => {
    expect(needsTimezonesClarification('+50312345678')).toBe(false);
  });

  it('returns true for Spain (+34)', () => {
    expect(needsTimezonesClarification('+34612345678')).toBe(true);
  });

  it('returns true for US numbers (+1)', () => {
    expect(needsTimezonesClarification('+12125551234')).toBe(true);
  });

  it('returns true for Colombia (+57)', () => {
    expect(needsTimezonesClarification('+573001234567')).toBe(true);
  });

  it('returns true for Argentina (+54)', () => {
    expect(needsTimezonesClarification('+5491112345678')).toBe(true);
  });

  it('returns true for UK (+44)', () => {
    expect(needsTimezonesClarification('+447911123456')).toBe(true);
  });

  it('returns false for unknown/unrecognized numbers', () => {
    // China (+86) is not in our database → returns null → false
    expect(needsTimezonesClarification('+861012345678')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(needsTimezonesClarification('')).toBe(false);
  });

  it('returns false for Panama (+507 — EST, same as Mexico CST-1h, but marked differsFromMexico)', () => {
    // Panama is in EST (UTC-5) which differs from Mexico CST (UTC-6)
    expect(needsTimezonesClarification('+50712345678')).toBe(true);
  });
});

// ════════════════════════════════════════════════════
// buildTimezoneSchedulingNudge
// ════════════════════════════════════════════════════

describe('buildTimezoneSchedulingNudge', () => {
  it('returns empty string for Mexican number', () => {
    const result = buildTimezoneSchedulingNudge('+5215512345678', 'es');
    expect(result).toBe('');
  });

  it('returns empty string for Guatemala (same TZ)', () => {
    const result = buildTimezoneSchedulingNudge('+50212345678', 'es');
    expect(result).toBe('');
  });

  it('returns Spanish nudge for Spain with correct country name', () => {
    const result = buildTimezoneSchedulingNudge('+34612345678', 'es');
    expect(result).toContain('España');
    expect(result).toContain('CDMX');
    expect(result).toContain('ACLARACIÓN DE ZONA HORARIA REQUERIDA');
    expect(result).toContain('hora local');
  });

  it('returns Spanish nudge for Colombia', () => {
    const result = buildTimezoneSchedulingNudge('+573001234567', 'es');
    expect(result).toContain('Colombia');
    expect(result).toContain('CDMX');
  });

  it('returns Spanish nudge for US', () => {
    const result = buildTimezoneSchedulingNudge('+12125551234', 'es');
    expect(result).toContain('Estados Unidos');
    expect(result).toContain('CDMX');
  });

  it('returns English nudge when language is "en"', () => {
    const result = buildTimezoneSchedulingNudge('+34612345678', 'en');
    expect(result).toContain('TIMEZONE CLARIFICATION REQUIRED');
    expect(result).toContain('España');
    expect(result).toContain('CDMX');
    expect(result).toContain('local time');
  });

  it('returns English nudge for US in English', () => {
    const result = buildTimezoneSchedulingNudge('+12125551234', 'en');
    expect(result).toContain('TIMEZONE CLARIFICATION REQUIRED');
    expect(result).toContain('Estados Unidos');
  });

  it('nudge instructs AI to ask before confirming', () => {
    const result = buildTimezoneSchedulingNudge('+34612345678', 'es');
    expect(result).toContain('ANTES de confirmar');
  });

  it('nudge instructs AI to confirm in CDMX time', () => {
    const result = buildTimezoneSchedulingNudge('+34612345678', 'es');
    expect(result).toContain('hora de Ciudad de México');
  });
});

// ════════════════════════════════════════════════════
// convertClientTimeToMexico
// ════════════════════════════════════════════════════

describe('convertClientTimeToMexico', () => {
  it('converts Spain (CET, UTC+1) 3 PM to ~8 AM CDMX (UTC-6)', () => {
    // Spain in winter (CET = UTC+1), Mexico City in winter (CST = UTC-6) → 7h difference
    // Spain 3 PM = UTC 2 PM = Mexico City 8 AM
    const result = convertClientTimeToMexico('2026-01-15T15:00:00', 'Europe/Madrid');
    expect(result).toContain('T08:00:00');
  });

  it('converts US Eastern (EST, UTC-5) 3 PM to 2 PM CDMX (UTC-6)', () => {
    // US EST = UTC-5, Mexico CST = UTC-6 → 1h difference
    // US 3 PM EST = UTC 8 PM = Mexico 2 PM CST
    const result = convertClientTimeToMexico('2026-01-15T15:00:00', 'America/New_York');
    expect(result).toContain('T14:00:00');
  });

  it('converts Colombia (COT, UTC-5) 3 PM to 2 PM CDMX (UTC-6)', () => {
    // Colombia UTC-5 = Mexico CST UTC-6 → 1h difference (same as US East)
    const result = convertClientTimeToMexico('2026-01-15T15:00:00', 'America/Bogota');
    expect(result).toContain('T14:00:00');
  });

  it('returns an ISO string with timezone offset', () => {
    const result = convertClientTimeToMexico('2026-04-10T10:00:00', 'Europe/Madrid');
    // Should be a valid ISO string with offset
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('handles datetime with existing offset (strips and re-interprets)', () => {
    // Even if there's an existing offset, we treat the wall-clock time as client-local
    const result = convertClientTimeToMexico('2026-01-15T15:00:00+01:00', 'Europe/Madrid');
    // The +01:00 suffix gets stripped, treated as 15:00 Spain time
    expect(result).toContain('T08:00:00');
  });
});

// ════════════════════════════════════════════════════
// International number detection — end to end flow
// ════════════════════════════════════════════════════

describe('International lead scheduling flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // April 9, 2026 at 10 AM UTC (= 4 AM CDT Mexico City)
    vi.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Schedule intent detected for international client', () => {
    it('Spain client proposing "el jueves a las 3" triggers confirm_schedule', () => {
      const message = 'El jueves a las 3 me queda perfecto';
      const { intent } = detectIntent(message, 3, 'active', 'es');
      expect(intent).toBe('confirm_schedule');
    });

    it('Colombia client proposing time triggers confirm_schedule', () => {
      const message = 'Puedo el viernes a las 2pm';
      const { intent } = detectIntent(message, 3, 'active', 'es');
      expect(intent).toBe('confirm_schedule');
    });

    it('US client proposing time in English triggers confirm_schedule', () => {
      const message = 'Thursday at 3pm works for me';
      const { intent } = detectIntent(message, 3, 'active', 'en');
      expect(intent).toBe('confirm_schedule');
    });

    it('needsTimezonesClarification returns true for Spain phone', () => {
      expect(needsTimezonesClarification('+34612345678')).toBe(true);
    });

    it('buildTimezoneSchedulingNudge + confirm_schedule = complete scheduling context', () => {
      const phone = '+34612345678';
      const message = 'El jueves a las 3 me queda perfecto';
      const { intent } = detectIntent(message, 3, 'active', 'es');

      expect(intent).toBe('confirm_schedule');

      const needsClarification = needsTimezonesClarification(phone);
      expect(needsClarification).toBe(true);

      const nudge = buildTimezoneSchedulingNudge(phone, 'es');
      expect(nudge).toContain('España');
      expect(nudge).toContain('ANTES de confirmar');
    });
  });

  describe('Mexican client scheduling — no timezone clarification needed', () => {
    it('Mexican client scheduling does not need TZ clarification', () => {
      const phone = '+5215512345678';
      expect(needsTimezonesClarification(phone)).toBe(false);
      expect(buildTimezoneSchedulingNudge(phone, 'es')).toBe('');
    });

    it('Mexican client confirm_schedule extracts correct datetime', () => {
      const message = 'El jueves a las 3 de la tarde';
      const datetime = extractDatetime(message);
      expect(datetime).not.toBeNull();
      // Should be Thursday at 15:00 Mexico City time
      expect(datetime).toContain('T15:00:00');
    });
  });

  describe('Datetime extraction for scheduling messages', () => {
    it('extracts datetime from "el jueves a las 3pm"', () => {
      const datetime = extractDatetime('el jueves a las 3pm');
      expect(datetime).not.toBeNull();
      expect(datetime).toContain('T15:00:00');
    });

    it('extracts datetime from English "Thursday at 3pm"', () => {
      const datetime = extractDatetime('Thursday at 3pm');
      expect(datetime).not.toBeNull();
      expect(datetime).toContain('T15:00:00');
    });

    it('extracts datetime from "el viernes a las 10 de la mañana"', () => {
      const datetime = extractDatetime('el viernes a las 10 de la mañana');
      expect(datetime).not.toBeNull();
      expect(datetime).toContain('T10:00:00');
    });

    it('returns null for messages with no time reference', () => {
      expect(extractDatetime('Hola, quiero más información')).toBeNull();
    });

    it('returns null for "mi hora" (response to TZ clarification, no actual time)', () => {
      expect(extractDatetime('mi hora')).toBeNull();
    });

    it('returns null for "sí, en mi horario"', () => {
      expect(extractDatetime('sí, en mi horario')).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════
// buildTimezoneContext for scheduling (passive context)
// ════════════════════════════════════════════════════

describe('buildTimezoneContext in scheduling scenarios', () => {
  it('includes both client and Mexico city times for Spain', () => {
    const result = buildTimezoneContext('+34612345678');
    expect(result).toContain('España');
    expect(result).toContain('Ciudad de México');
    expect(result).toContain('hora de Ciudad de México (CDMX)');
  });

  it('instructs bot to specify CDMX when confirming', () => {
    const result = buildTimezoneContext('+12125551234');
    expect(result).toContain('SIEMPRE especifica');
    expect(result).toContain('hora de Ciudad de México (CDMX)');
  });

  it('does not include CDMX warning for same-timezone countries', () => {
    // Guatemala, El Salvador, Honduras, Costa Rica — all CST like Mexico
    const guatemala = buildTimezoneContext('+50212345678');
    expect(guatemala).toBe('');

    const elsalvador = buildTimezoneContext('+50312345678');
    expect(elsalvador).toBe('');
  });

  it('returns non-empty context for Argentina', () => {
    const result = buildTimezoneContext('+5491112345678');
    expect(result).toContain('Argentina');
    expect(result).not.toBe('');
  });
});
