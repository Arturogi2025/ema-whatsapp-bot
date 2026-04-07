import { describe, it, expect } from 'vitest';
import { detectTimezoneFromPhone, buildTimezoneContext } from '../lib/timezone';

// ════════════════════════════════════════════════════
// detectTimezoneFromPhone
// ════════════════════════════════════════════════════

describe('detectTimezoneFromPhone', () => {
  describe('Mexico numbers (home base)', () => {
    it('detects Mexican numbers with +52 prefix', () => {
      const result = detectTimezoneFromPhone('+5215512345678');
      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('America/Mexico_City');
      expect(result!.differsFromMexico).toBe(false);
      expect(result!.country).toBe('México');
    });

    it('detects Mexican numbers without + prefix', () => {
      const result = detectTimezoneFromPhone('5215512345678');
      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('America/Mexico_City');
    });

    it('handles numbers with spaces and dashes', () => {
      const result = detectTimezoneFromPhone('+52 155 1234 5678');
      expect(result).not.toBeNull();
      expect(result!.country).toBe('México');
    });

    it('handles numbers with parentheses', () => {
      const result = detectTimezoneFromPhone('+52(155)12345678');
      expect(result).not.toBeNull();
      expect(result!.country).toBe('México');
    });
  });

  describe('US numbers', () => {
    it('detects US numbers with +1 prefix', () => {
      const result = detectTimezoneFromPhone('+12125551234');
      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('America/New_York');
      expect(result!.differsFromMexico).toBe(true);
      expect(result!.country).toBe('Estados Unidos');
    });
  });

  describe('Central America (same timezone as Mexico)', () => {
    it('Guatemala (+502) - same timezone', () => {
      const result = detectTimezoneFromPhone('+50212345678');
      expect(result).not.toBeNull();
      expect(result!.differsFromMexico).toBe(false);
      expect(result!.country).toBe('Guatemala');
    });

    it('Costa Rica (+506) - same timezone', () => {
      const result = detectTimezoneFromPhone('+50612345678');
      expect(result).not.toBeNull();
      expect(result!.differsFromMexico).toBe(false);
    });

    it('Panama (+507) - different timezone', () => {
      const result = detectTimezoneFromPhone('+50712345678');
      expect(result).not.toBeNull();
      expect(result!.differsFromMexico).toBe(true);
      expect(result!.country).toBe('Panamá');
    });
  });

  describe('South America (different timezone)', () => {
    it('Argentina (+54)', () => {
      const result = detectTimezoneFromPhone('+5491112345678');
      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('America/Argentina/Buenos_Aires');
      expect(result!.differsFromMexico).toBe(true);
    });

    it('Colombia (+57)', () => {
      const result = detectTimezoneFromPhone('+573001234567');
      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('America/Bogota');
      expect(result!.differsFromMexico).toBe(true);
    });

    it('Chile (+56)', () => {
      const result = detectTimezoneFromPhone('+56912345678');
      expect(result).not.toBeNull();
      expect(result!.country).toBe('Chile');
    });
  });

  describe('Caribbean — longer prefix takes priority over +1', () => {
    it('Dominican Republic (+1809) takes priority over US (+1)', () => {
      const result = detectTimezoneFromPhone('+18091234567');
      expect(result).not.toBeNull();
      expect(result!.country).toBe('República Dominicana');
      expect(result!.timezone).toBe('America/Santo_Domingo');
    });

    it('Dominican Republic (+1829)', () => {
      const result = detectTimezoneFromPhone('+18291234567');
      expect(result).not.toBeNull();
      expect(result!.country).toBe('República Dominicana');
    });

    it('Cuba (+53)', () => {
      const result = detectTimezoneFromPhone('+5312345678');
      expect(result).not.toBeNull();
      expect(result!.differsFromMexico).toBe(false); // Same timezone
    });
  });

  describe('Europe (different timezone)', () => {
    it('Spain (+34)', () => {
      const result = detectTimezoneFromPhone('+34612345678');
      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('Europe/Madrid');
      expect(result!.differsFromMexico).toBe(true);
      expect(result!.country).toBe('España');
    });

    it('UK (+44)', () => {
      const result = detectTimezoneFromPhone('+447911123456');
      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('Europe/London');
    });

    it('Germany (+49)', () => {
      const result = detectTimezoneFromPhone('+4915112345678');
      expect(result).not.toBeNull();
      expect(result!.country).toBe('Alemania');
    });
  });

  describe('Unknown numbers', () => {
    it('returns null for unrecognized country codes', () => {
      const result = detectTimezoneFromPhone('+861012345678'); // China
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = detectTimezoneFromPhone('');
      expect(result).toBeNull();
    });

    it('matches short numbers that start with a valid prefix (e.g., "123" starts with "1" → US)', () => {
      // "123" starts with "1" which is the US country code
      const result = detectTimezoneFromPhone('123');
      expect(result).not.toBeNull();
      expect(result!.country).toBe('Estados Unidos');
    });
  });
});

// ════════════════════════════════════════════════════
// buildTimezoneContext
// ════════════════════════════════════════════════════

describe('buildTimezoneContext', () => {
  it('returns empty string for Mexican numbers (same timezone)', () => {
    const result = buildTimezoneContext('+5215512345678');
    expect(result).toBe('');
  });

  it('returns empty string for Guatemala (same timezone)', () => {
    const result = buildTimezoneContext('+50212345678');
    expect(result).toBe('');
  });

  it('returns timezone context for US numbers', () => {
    const result = buildTimezoneContext('+12125551234');
    expect(result).toContain('CONTEXTO DE ZONA HORARIA');
    expect(result).toContain('Estados Unidos');
    expect(result).toContain('hora de Ciudad de México (CDMX)');
  });

  it('returns timezone context for Spain', () => {
    const result = buildTimezoneContext('+34612345678');
    expect(result).toContain('España');
    expect(result).toContain('CDMX');
  });

  it('returns timezone context for Argentina', () => {
    const result = buildTimezoneContext('+5491112345678');
    expect(result).toContain('Argentina');
  });

  it('returns empty string for unknown numbers', () => {
    const result = buildTimezoneContext('+861012345678');
    expect(result).toBe('');
  });

  it('includes both client and Mexico times', () => {
    const result = buildTimezoneContext('+12125551234');
    // Should have time strings like "10:30 a. m." or similar
    expect(result).toContain('hora actual');
    expect(result).toContain('Ciudad de México');
  });
});
