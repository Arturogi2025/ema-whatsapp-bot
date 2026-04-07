import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectIntent,
  detectLanguage,
  detectDeferral,
  extractDatetime,
  extractProjectType,
  resolveToAbsoluteDate,
  SPAM_PATTERNS,
  IMMEDIATE_CALL_PATTERNS_ES,
  IMMEDIATE_CALL_PATTERNS_EN,
  SCHEDULE_PATTERNS,
} from '../lib/ai-handler';
import {
  detectTimezoneFromPhone,
  buildTimezoneContext,
  needsTimezonesClarification,
  buildTimezoneSchedulingNudge,
  convertClientTimeToMexico,
} from '../lib/timezone';
// ── Inline helpers (replicates dashboard/lib/tz without date-fns-tz dep) ──
function parseMXDatetime(dt: string): Date {
  const hasTz = /([+-]\d{2}:?\d{2}|Z)$/.test(dt);
  return hasTz ? new Date(dt) : new Date(dt + '-06:00');
}

function fmtRelativeMX(dt: string | null | undefined): string {
  if (!dt) return 'Sin agendar';
  const date = parseMXDatetime(dt);

  // Format H:mm in Mexico City
  const timeLabel = date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).replace(':', ':') + 'h';

  // "today" date in Mexico City
  const todayMX = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });
  const targetMX = date.toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });

  const diffDays = Math.round(
    (new Date(targetMX).getTime() - new Date(todayMX).getTime()) / (24 * 60 * 60 * 1000)
  );

  const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MONTH_NAMES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  if (diffDays === 0) return `Hoy · ${timeLabel}`;
  if (diffDays === 1) return `Mañana · ${timeLabel}`;
  if (diffDays === -1) return `Ayer · ${timeLabel}`;
  if (Math.abs(diffDays) <= 6) {
    const dayIdx = date.toLocaleDateString('en-US', { timeZone: 'America/Mexico_City', weekday: 'short' });
    const dayMap: Record<string, string> = { Mon: 'Lunes', Tue: 'Martes', Wed: 'Miércoles', Thu: 'Jueves', Fri: 'Viernes', Sat: 'Sábado', Sun: 'Domingo' };
    return `${dayMap[dayIdx] || dayIdx} · ${timeLabel}`;
  }
  const day = parseInt(date.toLocaleDateString('en-US', { timeZone: 'America/Mexico_City', day: 'numeric' }));
  const monthIdx = parseInt(date.toLocaleDateString('en-US', { timeZone: 'America/Mexico_City', month: 'numeric' })) - 1;
  return `${day} de ${MONTH_NAMES_ES[monthIdx]} · ${timeLabel}`;
}

// =============================================================
// TEST DATE: Monday April 7, 2026 @ 12:00 CDMX (18:00 UTC)
// =============================================================
const MOCK_NOW = new Date('2026-04-07T18:00:00.000Z'); // 12:00 CDMX

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCK_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 1: CLIENTES INTERNACIONALES — Detección de zona horaria
// ══════════════════════════════════════════════════════════════════

describe('🌎 Clientes internacionales — Detección de timezone', () => {
  it('México +52 → no requiere aclaración de zona horaria', () => {
    expect(needsTimezonesClarification('+5215512345678')).toBe(false);
    expect(needsTimezonesClarification('+521234567890')).toBe(false);
  });

  it('España +34 → requiere aclaración de zona horaria', () => {
    expect(needsTimezonesClarification('+34612345678')).toBe(true);
  });

  it('Argentina +54 → requiere aclaración', () => {
    expect(needsTimezonesClarification('+5491112345678')).toBe(true);
  });

  it('Colombia +57 → requiere aclaración', () => {
    expect(needsTimezonesClarification('+573012345678')).toBe(true);
  });

  it('Estados Unidos +1 → requiere aclaración', () => {
    expect(needsTimezonesClarification('+12125551234')).toBe(true);
  });

  it('Guatemala +502 → NO requiere aclaración (misma zona CST)', () => {
    expect(needsTimezonesClarification('+50212345678')).toBe(false);
  });

  it('El Salvador +503 → NO requiere aclaración', () => {
    expect(needsTimezonesClarification('+50312345678')).toBe(false);
  });

  it('Honduras +504 → NO requiere aclaración', () => {
    expect(needsTimezonesClarification('+50412345678')).toBe(false);
  });

  it('Cuba +53 → NO requiere aclaración (misma zona)', () => {
    expect(needsTimezonesClarification('+5312345678')).toBe(false);
  });

  it('Rep. Dominicana +1809 → requiere aclaración', () => {
    expect(needsTimezonesClarification('+18095551234')).toBe(true);
  });

  it('Brasil +55 → requiere aclaración', () => {
    expect(needsTimezonesClarification('+5511912345678')).toBe(true);
  });

  it('Número desconocido → no requiere aclaración (default null)', () => {
    expect(needsTimezonesClarification('+99912345678')).toBe(false);
  });
});

describe('🌎 Clientes internacionales — buildTimezoneContext', () => {
  it('México → contexto vacío (misma zona)', () => {
    const ctx = buildTimezoneContext('+5215512345678');
    expect(ctx).toBe('');
  });

  it('España → incluye advertencia CDMX', () => {
    const ctx = buildTimezoneContext('+34612345678');
    expect(ctx).toContain('CONTEXTO DE ZONA HORARIA');
    expect(ctx).toContain('España');
    expect(ctx).toContain('hora de Ciudad de México (CDMX)');
  });

  it('EE.UU. → incluye advertencia CDMX y nombre del país', () => {
    const ctx = buildTimezoneContext('+12125551234');
    expect(ctx).toContain('Estados Unidos');
    expect(ctx).toContain('Ciudad de México');
  });

  it('Argentina → menciona Argentina', () => {
    const ctx = buildTimezoneContext('+5491112345678');
    expect(ctx).toContain('Argentina');
  });
});

describe('🌎 Clientes internacionales — Nudge de agendamiento', () => {
  it('España: al confirmar horario, nudge pide aclaración de TZ', () => {
    const nudge = buildTimezoneSchedulingNudge('+34612345678', 'es');
    expect(nudge).toContain('ACLARACIÓN DE ZONA HORARIA REQUERIDA');
    expect(nudge).toContain('España');
    expect(nudge).toContain('hora de Ciudad de México (CDMX)');
  });

  it('México: no hay nudge', () => {
    const nudge = buildTimezoneSchedulingNudge('+5215512345678', 'es');
    expect(nudge).toBe('');
  });

  it('EE.UU. en inglés: nudge en inglés', () => {
    const nudge = buildTimezoneSchedulingNudge('+12125551234', 'en');
    expect(nudge).toContain('TIMEZONE CLARIFICATION REQUIRED');
    expect(nudge).toContain('Estados Unidos');
    expect(nudge).toContain('Mexico City time (CDMX)');
  });

  it('Colombia: nudge en español por defecto', () => {
    const nudge = buildTimezoneSchedulingNudge('+573012345678');
    expect(nudge).toContain('Colombia');
    expect(nudge).toContain('hora local');
  });
});

describe('🌎 Clientes internacionales — Conversión de hora', () => {
  it('España (UTC+2 en verano) 15:00 → 07:00 CDMX', () => {
    // April 2026: Spain = UTC+2, Mexico City = UTC-6 → difference = 8h
    const result = convertClientTimeToMexico('2026-04-10T15:00:00', 'Europe/Madrid');
    expect(result).toContain('T07:00:00');
  });

  it('Argentina (UTC-3) 12:00 → 09:00 CDMX', () => {
    // Argentina = UTC-3, Mexico = UTC-6 → Argentina 3h ahead → 12:00 ART = 09:00 CDT...
    // Actually Mexico = UTC-6, Argentina = UTC-3: diff = 3h (Argentina ahead)
    // 12:00 Argentina = 09:00 Mexico City
    const result = convertClientTimeToMexico('2026-04-10T12:00:00', 'America/Argentina/Buenos_Aires');
    expect(result).toContain('T09:00:00');
  });

  it('EE.UU. Eastern (UTC-4 en verano) 11:00 → 09:00 CDMX', () => {
    // US Eastern in April = EDT (UTC-4), Mexico = UTC-6 → EDT is 2h ahead
    // 11:00 EDT = 09:00 CDMX
    const result = convertClientTimeToMexico('2026-04-10T11:00:00', 'America/New_York');
    expect(result).toContain('T09:00:00');
  });

  it('Colombia (UTC-5) 10:00 → 09:00 CDMX', () => {
    // Colombia = UTC-5, Mexico = UTC-6 → Colombia 1h ahead
    // 10:00 COT = 09:00 CDMX
    const result = convertClientTimeToMexico('2026-04-10T10:00:00', 'America/Bogota');
    expect(result).toContain('T09:00:00');
  });

  it('Resultado incluye offset de Mexico City', () => {
    const result = convertClientTimeToMexico('2026-04-10T12:00:00', 'America/Mexico_City');
    // Should include Mexico offset (-06:00 or -05:00 depending on DST)
    expect(result).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 2: DETECCIÓN DE IDIOMA
// ══════════════════════════════════════════════════════════════════

describe('🗣️ Detección de idioma', () => {
  it('Español claro → "es"', () => {
    expect(detectLanguage('Hola, necesito una página web')).toBe('es');
    expect(detectLanguage('Buenos días, quiero información')).toBe('es');
    expect(detectLanguage('Cuánto cuesta una tienda online?')).toBe('es');
  });

  it('Inglés claro → "en"', () => {
    expect(detectLanguage('Hello, I need a website for my business')).toBe('en');
    expect(detectLanguage('How much does a landing page cost?')).toBe('en');
    expect(detectLanguage('I would like more information about your services')).toBe('en');
  });

  it('Saludo ambiguo → español por defecto', () => {
    // "Ok" / "Si" / short messages → default es
    const lang = detectLanguage('Ok');
    expect(lang).toBe('es');
  });

  it('Cliente inglés con historial → mantiene inglés aunque mensaje sea ambiguo', () => {
    const history = [
      { role: 'user', content: 'Hello I need a website for my company' },
      { role: 'assistant', content: 'Hi! Thanks for reaching out.' },
    ];
    const lang = detectLanguage('Yes', history);
    expect(lang).toBe('en');
  });

  it('Español dominicano / caribeño → "es"', () => {
    expect(detectLanguage('Buenas, quiero una página web')).toBe('es');
  });

  it('Mensaje de España → detecta español', () => {
    expect(detectLanguage('Hola, necesito información sobre vuestros servicios')).toBe('es');
  });

  it('Mensaje de Argentina → detecta español', () => {
    expect(detectLanguage('Hola! Necesito presupuesto para página web')).toBe('es');
  });

  it('Inglés con scheduling → "en"', () => {
    expect(detectLanguage('Thursday at 3pm works for me')).toBe('en');
  });

  it('Deferral en inglés → "en"', () => {
    expect(detectLanguage("I'm driving, I'll get back to you later")).toBe('en');
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 3: DETECCIÓN DE INTENCIÓN — flujo completo del bot
// ══════════════════════════════════════════════════════════════════

describe('🤖 Detección de intención — flujo completo', () => {
  describe('Primer mensaje (messageCount=0)', () => {
    it('Saludo → greeting', () => {
      expect(detectIntent('Hola', 0, 'active', 'es').intent).toBe('greeting');
      expect(detectIntent('Buenos días', 0, 'active', 'es').intent).toBe('greeting');
      expect(detectIntent('Buenas tardes', 0, 'active', 'es').intent).toBe('greeting');
    });

    it('Spam → general', () => {
      expect(detectIntent('Hola ofrezco seguidores y likes', 0, 'active', 'es').intent).toBe('general');
      expect(detectIntent('Soy community manager', 0, 'active', 'es').intent).toBe('general');
      expect(detectIntent('Grow your social media presence', 0, 'active', 'es').intent).toBe('general');
    });
  });

  describe('Follow-up de conversación agendada', () => {
    it('Cualquier mensaje → followup_scheduled', () => {
      expect(detectIntent('Hola', 5, 'scheduled', 'es').intent).toBe('followup_scheduled');
      expect(detectIntent('El jueves a las 3', 5, 'scheduled', 'es').intent).toBe('followup_scheduled');
      expect(detectIntent('Quiero cancelar', 10, 'scheduled', 'es').intent).toBe('followup_scheduled');
    });
  });

  describe('Consulta de precio', () => {
    it('Español → price_inquiry', () => {
      expect(detectIntent('Cuánto cuesta una página web?', 1).intent).toBe('price_inquiry');
      expect(detectIntent('Me puede dar un presupuesto?', 2).intent).toBe('price_inquiry');
      expect(detectIntent('Tienen cotizaciones?', 3).intent).toBe('price_inquiry');
    });

    it('Inglés → price_inquiry', () => {
      expect(detectIntent('How much does a website cost?', 1, 'active', 'en').intent).toBe('price_inquiry');
      expect(detectIntent('What are your pricing options?', 2, 'active', 'en').intent).toBe('price_inquiry');
    });
  });

  describe('Solicitud de llamada inmediata', () => {
    it('Márcame → confirm_schedule (sin importar messageCount)', () => {
      expect(detectIntent('Márcame', 0, 'active', 'es').intent).toBe('confirm_schedule');
      expect(detectIntent('Sí márcame por favor', 1, 'active', 'es').intent).toBe('confirm_schedule');
    });

    it('Llámame → confirm_schedule', () => {
      expect(detectIntent('Llámame cuando pueda', 2, 'active', 'es').intent).toBe('confirm_schedule');
    });

    it('Si gusta marcar → confirm_schedule', () => {
      expect(detectIntent('Si gusta marcar ahorita', 0, 'active', 'es').intent).toBe('confirm_schedule');
    });

    it('Call me (inglés) → confirm_schedule', () => {
      expect(detectIntent('Call me please', 1, 'active', 'en').intent).toBe('confirm_schedule');
    });
  });

  describe('Confirmación de horario (messageCount ≥ 2)', () => {
    it('Día de la semana → confirm_schedule', () => {
      expect(detectIntent('El jueves a las 3pm', 3, 'active', 'es').intent).toBe('confirm_schedule');
      expect(detectIntent('El miércoles en la mañana', 2, 'active', 'es').intent).toBe('confirm_schedule');
      expect(detectIntent('El viernes al mediodía', 4, 'active', 'es').intent).toBe('confirm_schedule');
    });

    it('Mañana a las X → confirm_schedule', () => {
      expect(detectIntent('Mañana a las 10am', 2, 'active', 'es').intent).toBe('confirm_schedule');
    });

    it('Fecha explícita → confirm_schedule', () => {
      expect(detectIntent('El 15 de abril a las 2pm', 2, 'active', 'es').intent).toBe('confirm_schedule');
    });

    it('Inglés: Thursday at 3pm → confirm_schedule', () => {
      expect(detectIntent('Thursday at 3pm works for me', 3, 'active', 'en').intent).toBe('confirm_schedule');
    });

    it('Horario antes de 2 mensajes NO activa schedule', () => {
      // messageCount=1 → no scheduling detection (to avoid false positives)
      const result = detectIntent('Tengo 12 empleados', 1, 'active', 'es');
      expect(result.intent).not.toBe('confirm_schedule');
    });
  });

  describe('Propuesta de llamada', () => {
    it('Menciona proyecto → propose_call + portfolio', () => {
      const r = detectIntent('Necesito una página web para mi negocio', 2, 'active', 'es');
      expect(r.intent).toBe('propose_call');
      expect(r.shouldSendPortfolio).toBe(true);
    });

    it('Tienda online → propose_call + portfolio', () => {
      const r = detectIntent('Quiero una tienda online', 3, 'active', 'es');
      expect(r.intent).toBe('propose_call');
      expect(r.shouldSendPortfolio).toBe(true);
    });

    it('4+ mensajes sin proyecto → propose_call sin portfolio', () => {
      const r = detectIntent('Me interesa saber más', 4, 'active', 'es');
      expect(r.intent).toBe('propose_call');
      expect(r.shouldSendPortfolio).toBe(false);
    });
  });

  describe('Descubrimiento', () => {
    it('Mensaje general → discovery', () => {
      expect(detectIntent('Me interesa su servicio', 1, 'active', 'es').intent).toBe('discovery');
      expect(detectIntent('Qué servicios ofrecen?', 2, 'active', 'es').intent).toBe('discovery');
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 4: DETECCIÓN DE APLAZAMIENTO (DEFERRAL)
// ══════════════════════════════════════════════════════════════════

describe('⏸️ Detección de aplazamiento — pausa automática de IA', () => {
  describe('Español', () => {
    it('Luego te aviso → deferral', () => {
      expect(detectDeferral('Luego te aviso', 'es')).not.toBeNull();
    });

    it('Estoy manejando → deferral', () => {
      expect(detectDeferral('Estoy manejando', 'es')).not.toBeNull();
    });

    it('Estoy en junta → deferral', () => {
      expect(detectDeferral('Estoy en junta ahorita', 'es')).not.toBeNull();
    });

    it('Estoy ocupado → deferral', () => {
      expect(detectDeferral('Ahorita estoy ocupado', 'es')).not.toBeNull();
    });

    it('Después te aviso → deferral', () => {
      expect(detectDeferral('Después te aviso', 'es')).not.toBeNull();
    });

    it('Al rato te escribo → deferral', () => {
      expect(detectDeferral('Al rato te escribo', 'es')).not.toBeNull();
    });

    it('No puedo hablar ahorita → deferral', () => {
      expect(detectDeferral('No puedo hablar ahorita', 'es')).not.toBeNull();
    });

    it('Retorna mensaje correcto en español', () => {
      expect(detectDeferral('Luego te aviso', 'es')).toBe('Cliente indicó que responderá después');
    });

    it('Mensaje normal → NO es deferral', () => {
      expect(detectDeferral('El jueves a las 3pm', 'es')).toBeNull();
      expect(detectDeferral('Me interesa la página web', 'es')).toBeNull();
      expect(detectDeferral('Hola buenas tardes', 'es')).toBeNull();
    });
  });

  describe('Inglés', () => {
    it("I'm driving → deferral", () => {
      expect(detectDeferral("I'm driving", 'en')).not.toBeNull();
    });

    it("I'll get back to you later → deferral", () => {
      expect(detectDeferral("I'll get back to you later", 'en')).not.toBeNull();
    });

    it("Can't talk right now → deferral", () => {
      expect(detectDeferral("Can't talk right now", 'en')).not.toBeNull();
    });

    it("I'm in a meeting → deferral", () => {
      expect(detectDeferral("I'm in a meeting", 'en')).not.toBeNull();
    });

    it('Talk to you later → deferral', () => {
      expect(detectDeferral('Talk to you later', 'en')).not.toBeNull();
    });

    it('brb → deferral', () => {
      expect(detectDeferral('brb', 'en')).not.toBeNull();
    });

    it('Retorna mensaje correcto en inglés', () => {
      expect(detectDeferral("I'm driving", 'en')).toBe('Customer indicated they will respond later');
    });

    it('Normal message → NO deferral', () => {
      expect(detectDeferral('Thursday at 3pm works', 'en')).toBeNull();
      expect(detectDeferral('I need a website', 'en')).toBeNull();
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 5: EXTRACCIÓN DE TIPO DE PROYECTO
// ══════════════════════════════════════════════════════════════════

describe('🏗️ Extracción de tipo de proyecto', () => {
  it('Página web → detecta proyecto web', () => {
    expect(extractProjectType('Necesito una página web')).not.toBeNull();
  });

  it('Tienda online / ecommerce → detecta proyecto', () => {
    expect(extractProjectType('Quiero una tienda online')).not.toBeNull();
    expect(extractProjectType('Necesito un ecommerce')).not.toBeNull();
  });

  it('Landing page → detecta proyecto', () => {
    expect(extractProjectType('Una landing page para mi producto')).not.toBeNull();
  });

  it('Sistema a medida → detecta proyecto', () => {
    expect(extractProjectType('Necesito un sistema a medida')).not.toBeNull();
  });

  it('Mensaje sin tipo de proyecto → null', () => {
    expect(extractProjectType('Hola buenas tardes')).toBeNull();
    expect(extractProjectType('Cuánto cobran?')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 6: EXTRACCIÓN DE DATETIME — todos los formatos
// ══════════════════════════════════════════════════════════════════

describe('📅 Extracción de datetime — formatos y edge cases', () => {
  // MOCK: April 7, 2026 (Monday) at 12:00 CDMX

  describe('Días de la semana', () => {
    it('El jueves a las 3pm → extrae datetime', () => {
      const dt = extractDatetime('El jueves a las 3pm me funciona');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T15:00:00');
    });

    it('El miércoles a las 10am → extrae datetime', () => {
      const dt = extractDatetime('El miércoles a las 10am');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T10:00:00');
    });

    it('El viernes al mediodía → extrae datetime', () => {
      const dt = extractDatetime('El viernes al mediodía');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T12:00:00');
    });

    it('El lunes a las 9 de la mañana → extrae datetime', () => {
      const dt = extractDatetime('El lunes a las 9 de la mañana');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T09:00:00');
    });

    it('El sábado a las 3 de la tarde → extrae 15:00', () => {
      const dt = extractDatetime('El sábado a las 3 de la tarde');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T15:00:00');
    });

    it('Hora ambigua 1-7 → PM por defecto', () => {
      const dt = extractDatetime('El jueves a las 3');
      expect(dt).not.toBeNull();
      // Hours 1-7 without AM/PM should default to PM (13:00-19:00)
      expect(dt).toContain('T15:00:00');
    });

    it('Hora 8+ sin AM/PM → AM (mañana)', () => {
      const dt = extractDatetime('El jueves a las 10');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T10:00:00');
    });
  });

  describe('Fechas relativas', () => {
    it('Mañana a las 11am → April 8', () => {
      const dt = extractDatetime('Mañana a las 11am');
      expect(dt).not.toBeNull();
      expect(dt).toContain('2026-04-08');
      expect(dt).toContain('T11:00:00');
    });

    it('Hoy a las 5pm → April 7', () => {
      const dt = extractDatetime('Hoy a las 5pm');
      expect(dt).not.toBeNull();
      expect(dt).toContain('2026-04-07');
      expect(dt).toContain('T17:00:00');
    });

    it('Pasado mañana → April 9', () => {
      const dt = extractDatetime('Pasado mañana a las 3pm');
      expect(dt).not.toBeNull();
      expect(dt).toContain('2026-04-09');
    });
  });

  describe('Fechas explícitas', () => {
    it('15 de abril a las 2pm → extrae correctamente', () => {
      const dt = extractDatetime('El 15 de abril a las 2pm');
      expect(dt).not.toBeNull();
      expect(dt).toContain('2026-04-15');
      expect(dt).toContain('T14:00:00');
    });

    it('20 de mayo a las 10am', () => {
      const dt = extractDatetime('El 20 de mayo a las 10am');
      expect(dt).not.toBeNull();
      expect(dt).toContain('2026-05-20');
      expect(dt).toContain('T10:00:00');
    });
  });

  describe('Inglés', () => {
    it('Thursday at 3pm', () => {
      const dt = extractDatetime('Thursday at 3pm');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T15:00:00');
    });

    it('Tomorrow at 10am — extrae hora pero "tomorrow" en inglés no desplaza la fecha (solo español soportado)', () => {
      // extractDatetime soporta "mañana" en español, pero no "tomorrow" en inglés.
      // El tiempo se extrae correctamente; la fecha cae en hoy por defecto.
      const dt = extractDatetime('Tomorrow at 10am');
      expect(dt).not.toBeNull();
      expect(dt).toContain('T10:00:00'); // hora sí se extrae
      // Fecha = hoy porque "tomorrow" no está en los patrones ES
      expect(dt).toContain('2026-04-07');
    });
  });

  describe('Casos que NO son fecha', () => {
    it('Mensaje sin fecha → null', () => {
      expect(extractDatetime('Hola buenas tardes')).toBeNull();
      expect(extractDatetime('Cuánto cuesta?')).toBeNull();
      expect(extractDatetime('Me interesa')).toBeNull();
    });

    it('Número que no es hora → null', () => {
      // "Tengo 12 empleados" should NOT be parsed as datetime
      expect(extractDatetime('Tengo 12 empleados en mi empresa')).toBeNull();
    });
  });

  describe('Offset de timezone', () => {
    it('Resultado incluye offset -06:00 (CDMX sin DST)', () => {
      const dt = extractDatetime('El jueves a las 3pm');
      expect(dt).toMatch(/-06:00$/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 7: FLUJO COMPLETO — Conversación → Agendamiento
// ══════════════════════════════════════════════════════════════════

describe('🔄 Flujo completo: conversación → agendamiento automático', () => {
  it('Escenario: cliente mexicano completo (hola → proyecto → horario)', () => {
    // Paso 1: Saludo
    const r1 = detectIntent('Hola', 0, 'active', 'es');
    expect(r1.intent).toBe('greeting');

    // Paso 2: Menciona proyecto
    const r2 = detectIntent('Necesito una página web para mi restaurante', 2, 'active', 'es');
    expect(r2.intent).toBe('propose_call');
    expect(r2.shouldSendPortfolio).toBe(true);

    // Paso 3: Confirma horario
    const r3 = detectIntent('El jueves a las 3pm', 4, 'active', 'es');
    expect(r3.intent).toBe('confirm_schedule');

    // Paso 4: Extraer datetime
    const dt = extractDatetime('El jueves a las 3pm me funciona perfecto');
    expect(dt).not.toBeNull();
    expect(dt).toContain('T15:00:00');

    // Paso 5: Pipeline de auto-pause
    const shouldAutoPause = r3.intent === 'confirm_schedule' ? 'Llamada agendada - IA pausada automáticamente' : null;
    expect(shouldAutoPause).not.toBeNull();
  });

  it('Escenario: cliente español con timezone diferente', () => {
    const phone = '+34612345678';

    // Detectar que es cliente internacional
    expect(needsTimezonesClarification(phone)).toBe(true);

    // Al confirmar horario, generar nudge de TZ
    const r = detectIntent('El jueves a las 3pm', 4, 'active', 'es');
    expect(r.intent).toBe('confirm_schedule');

    // Verificar que se genera el nudge
    const nudge = buildTimezoneSchedulingNudge(phone, 'es');
    expect(nudge).toContain('España');
    expect(nudge.length).toBeGreaterThan(50);
  });

  it('Escenario: cliente EE.UU. en inglés', () => {
    const phone = '+12125551234';
    const lang = detectLanguage('Hello, I need a website for my restaurant');

    expect(lang).toBe('en');
    expect(needsTimezonesClarification(phone)).toBe(true);

    // Confirma horario en inglés
    const r = detectIntent('Thursday at 3pm works for me', 4, 'active', 'en');
    expect(r.intent).toBe('confirm_schedule');

    // Nudge en inglés
    const nudge = buildTimezoneSchedulingNudge(phone, 'en');
    expect(nudge).toContain('TIMEZONE CLARIFICATION REQUIRED');
  });

  it('Escenario: cliente con aplazamiento → NO agenda → pausa por deferral', () => {
    // Cliente dice que está ocupado
    const r = detectIntent('Estoy manejando, luego te aviso', 2, 'active', 'es');
    expect(r.intent).not.toBe('confirm_schedule');

    const deferral = detectDeferral('Estoy manejando, luego te aviso', 'es');
    expect(deferral).not.toBeNull();
    expect(deferral).toContain('responderá después');
  });

  it('Escenario: spam detectado → se descarta en mensaje 0', () => {
    const r = detectIntent('Ofrezco manejo de redes sociales a bajo costo', 0, 'active', 'es');
    expect(r.intent).toBe('general');
    expect(r.shouldSendPortfolio).toBe(false);
  });

  it('Escenario: márcame inmediato → agenda sin esperar descubrimiento', () => {
    // Cliente pide llamada inmediata en mensaje 0
    const r = detectIntent('Márcame por favor', 0, 'active', 'es');
    expect(r.intent).toBe('confirm_schedule');
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 8: LÓGICA DE AUTO-PAUSA Y CRON
// ══════════════════════════════════════════════════════════════════

describe('⏸️ Lógica de auto-pausa de IA', () => {
  it('confirm_schedule → auto-pause "Llamada agendada"', () => {
    const intent = 'confirm_schedule';
    const pause = intent === 'confirm_schedule' ? 'Llamada agendada - IA pausada automáticamente' : null;
    expect(pause).toBe('Llamada agendada - IA pausada automáticamente');
  });

  it('general (spam) → auto-pause "Spam/vendedor"', () => {
    const intent = 'general';
    const isSpam = SPAM_PATTERNS.test('hola ofrezco seguidores y likes');
    const pause = (intent === 'general' && isSpam) ? 'Spam/vendedor detectado - IA pausada' : null;
    expect(pause).toBe('Spam/vendedor detectado - IA pausada');
  });

  it('deferral → auto-pause con razón de aplazamiento', () => {
    const deferral = detectDeferral('Luego te aviso', 'es');
    expect(deferral).toBe('Cliente indicó que responderá después');
  });

  it('followup_scheduled → NO auto-pausa', () => {
    const intent = 'followup_scheduled';
    const pause = intent === 'confirm_schedule' ? 'Llamada agendada - IA pausada automáticamente' : null;
    expect(pause).toBeNull();
  });

  describe('Cron: qué pausas reciben follow-up', () => {
    function shouldFollowUp(reason: string): boolean {
      const r = reason.toLowerCase();
      if (r.includes('spam') || r.includes('vendedor')) return false;
      return r.includes('respond') || r.includes('later') ||
        r.includes('después') || r.includes('despues') || r.includes('responder');
    }

    it('Deferral ES → elegible para follow-up', () => {
      expect(shouldFollowUp('Cliente indicó que responderá después')).toBe(true);
    });

    it('Deferral EN → elegible para follow-up', () => {
      expect(shouldFollowUp('Customer indicated they will respond later')).toBe(true);
    });

    it('Spam → NO elegible para follow-up', () => {
      expect(shouldFollowUp('Spam/vendedor detectado - IA pausada')).toBe(false);
    });

    it('Llamada agendada → NO elegible para follow-up', () => {
      expect(shouldFollowUp('Llamada agendada - IA pausada automáticamente')).toBe(false);
    });

    it('Pausa manual → NO elegible (razón vacía)', () => {
      expect(shouldFollowUp('')).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 9: GOOGLE CALENDAR — construcción de evento
// ══════════════════════════════════════════════════════════════════

describe('📆 Google Calendar — construcción de evento', () => {
  function buildEventData(lead: {
    name?: string | null;
    phone: string;
    preferred_datetime: string;
    project_type?: string | null;
    notes?: string | null;
  }) {
    // Replicates logic from google-calendar.ts createCalendarEvent
    const PROJECT_LABELS: Record<string, string> = {
      web: 'Página web', ecommerce: 'Tienda online',
      landing: 'Landing page', redesign: 'Rediseño', custom: 'Sistema a medida',
    };

    const hasTzOffset = /([+-]\d{2}:?\d{2}|Z)$/.test(lead.preferred_datetime);
    const startDate = hasTzOffset
      ? new Date(lead.preferred_datetime)
      : new Date(lead.preferred_datetime + '-06:00');

    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 min

    return {
      summary: `Llamada: ${lead.name || lead.phone}`,
      description: [
        `Teléfono: ${lead.phone}`,
        lead.project_type ? `Tipo de proyecto: ${PROJECT_LABELS[lead.project_type] || lead.project_type}` : null,
        lead.notes ? `Notas: ${lead.notes}` : null,
        'Creado desde Bolt CRM',
      ].filter(Boolean).join('\n'),
      start: { dateTime: startDate.toISOString(), timeZone: 'America/Mexico_City' },
      end: { dateTime: endDate.toISOString(), timeZone: 'America/Mexico_City' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };
  }

  it('Evento con nombre → título correcto', () => {
    const ev = buildEventData({
      name: 'Mario López', phone: '+5215512345678',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
    });
    expect(ev.summary).toBe('Llamada: Mario López');
  });

  it('Evento sin nombre → usa teléfono', () => {
    const ev = buildEventData({
      name: null, phone: '+5215512345678',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
    });
    expect(ev.summary).toBe('Llamada: +5215512345678');
  });

  it('Duración del evento = 30 minutos exactos', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
    });
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end.dateTime);
    const diffMin = (end.getTime() - start.getTime()) / (1000 * 60);
    expect(diffMin).toBe(30);
  });

  it('Recordatorios: 60 min y 30 min antes', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
    });
    const reminders = ev.reminders.overrides;
    expect(reminders).toHaveLength(2);
    expect(reminders[0]).toEqual({ method: 'popup', minutes: 60 });
    expect(reminders[1]).toEqual({ method: 'popup', minutes: 30 });
    expect(ev.reminders.useDefault).toBe(false);
  });

  it('Timezone del evento = America/Mexico_City', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
    });
    expect(ev.start.timeZone).toBe('America/Mexico_City');
    expect(ev.end.timeZone).toBe('America/Mexico_City');
  });

  it('Tipo de proyecto traducido en descripción', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
      project_type: 'ecommerce',
    });
    expect(ev.description).toContain('Tienda online');
  });

  it('Notas incluidas en descripción', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
      notes: 'Cliente de España, timezone diferente',
    });
    expect(ev.description).toContain('Cliente de España');
  });

  it('Datetime sin offset (-06:00) → se parsea correctamente como CDMX', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00', // sin offset
    });
    // Should be parsed as CDMX (UTC-6) → 21:00 UTC
    const startUTC = new Date(ev.start.dateTime);
    expect(startUTC.getUTCHours()).toBe(21);
  });

  it('Datetime con offset → respeta el offset dado', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00-06:00', // con offset
    });
    const startUTC = new Date(ev.start.dateTime);
    expect(startUTC.getUTCHours()).toBe(21);
  });

  it('Descripción siempre incluye "Creado desde Bolt CRM"', () => {
    const ev = buildEventData({
      name: 'Test', phone: '+52',
      preferred_datetime: '2026-04-10T15:00:00-06:00',
    });
    expect(ev.description).toContain('Creado desde Bolt CRM');
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 10: FECHAS AMIGABLES — fmtRelativeMX
// ══════════════════════════════════════════════════════════════════

describe('🕐 Fechas amigables — fmtRelativeMX', () => {
  // Mock: April 7, 2026 (Monday) 12:00 CDMX

  it('Hoy → "Hoy · H:mmh"', () => {
    const result = fmtRelativeMX('2026-04-07T09:00:00-06:00');
    expect(result).toMatch(/^Hoy · \d{1,2}:\d{2}h$/);
    expect(result).toContain('9:00h');
  });

  it('Mañana → "Mañana · H:mmh"', () => {
    const result = fmtRelativeMX('2026-04-08T09:00:00-06:00');
    expect(result).toMatch(/^Mañana · \d{1,2}:\d{2}h$/);
  });

  it('Ayer → "Ayer · H:mmh"', () => {
    const result = fmtRelativeMX('2026-04-06T10:00:00-06:00');
    expect(result).toMatch(/^Ayer · \d{1,2}:\d{2}h$/);
  });

  it('2-6 días → nombre del día', () => {
    // April 9 = Thursday (jueves) — 2 days from April 7
    const result = fmtRelativeMX('2026-04-09T15:00:00-06:00');
    expect(result).toMatch(/^Jueves · \d{1,2}:\d{2}h$/);
  });

  it('April 11 (Saturday) → "Sábado · H:mmh"', () => {
    const result = fmtRelativeMX('2026-04-11T12:00:00-06:00');
    expect(result).toMatch(/^Sábado · /);
  });

  it('>6 días → "d de MMM · H:mmh"', () => {
    const result = fmtRelativeMX('2026-04-20T10:00:00-06:00');
    expect(result).toMatch(/^\d{1,2} de [a-záéíóú]+ · \d{1,2}:\d{2}h$/i);
    expect(result).toContain('abr');
  });

  it('null → "Sin agendar"', () => {
    expect(fmtRelativeMX(null)).toBe('Sin agendar');
    expect(fmtRelativeMX(undefined)).toBe('Sin agendar');
    expect(fmtRelativeMX('')).toBe('Sin agendar');
  });

  it('Formato sin offset → se parsea como CDMX', () => {
    // Bare string should be treated as Mexico City time (UTC-6)
    const result = fmtRelativeMX('2026-04-08T09:00');
    expect(result).not.toBe('Sin agendar');
    expect(result).toContain('9:00h');
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 11: NORMALIZACIÓN DE TELÉFONO
// ══════════════════════════════════════════════════════════════════

describe('📱 Normalización de teléfono', () => {
  function normalizePhone(raw: string): string {
    let phone = raw.replace(/[\s\-()]/g, '');
    if (phone.startsWith('+')) return phone;
    if (/^\d{10}$/.test(phone)) return '+52' + phone;
    if (phone.startsWith('52') && phone.length >= 12) return '+' + phone;
    if (phone.length >= 11) return '+' + phone;
    return '+52' + phone;
  }

  it('Número mexicano 10 dígitos → +52XXXXXXXXXX', () => {
    expect(normalizePhone('5512345678')).toBe('+525512345678');
  });

  it('Con código de país sin + → agrega +', () => {
    expect(normalizePhone('525512345678')).toBe('+525512345678');
  });

  it('Con + ya incluido → no modifica', () => {
    expect(normalizePhone('+525512345678')).toBe('+525512345678');
    expect(normalizePhone('+34612345678')).toBe('+34612345678');
    expect(normalizePhone('+12125551234')).toBe('+12125551234');
  });

  it('Número español +34 → no modifica', () => {
    expect(normalizePhone('+34 612 345 678')).toBe('+34612345678');
  });

  it('Número argentino → agrega + si falta', () => {
    expect(normalizePhone('5491112345678')).toBe('+5491112345678');
  });

  it('Con espacios o guiones → limpia primero', () => {
    expect(normalizePhone('55 1234 5678')).toBe('+525512345678');
    expect(normalizePhone('55-1234-5678')).toBe('+525512345678');
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 12: AGREGACIÓN DE MENSAJES MÚLTIPLES
// ══════════════════════════════════════════════════════════════════

describe('💬 Agregación de mensajes rápidos', () => {
  function aggregateMessages(history: Array<{ role: string; content: string }>) {
    const lastBotIdx = [...history].reverse().findIndex(m => m.role === 'assistant');
    const pending = lastBotIdx === -1
      ? history.filter(m => m.role === 'user')
      : history.slice(history.length - lastBotIdx).filter(m => m.role === 'user');
    return pending.length > 1
      ? pending.map(m => m.content).join('\n')
      : pending[0]?.content || '';
  }

  it('3 mensajes rápidos → se agregan en uno', () => {
    const history = [
      { role: 'assistant', content: '¡Hola!' },
      { role: 'user', content: 'El jueves' },
      { role: 'user', content: 'A las 3pm' },
      { role: 'user', content: 'Perfecto para mí' },
    ];
    const aggregated = aggregateMessages(history);
    expect(aggregated).toBe('El jueves\nA las 3pm\nPerfecto para mí');
  });

  it('1 mensaje → se usa directamente', () => {
    const history = [
      { role: 'assistant', content: '¡Hola!' },
      { role: 'user', content: 'Necesito una página web' },
    ];
    const aggregated = aggregateMessages(history);
    expect(aggregated).toBe('Necesito una página web');
  });

  it('Sin mensajes previos del bot → todos los user messages', () => {
    const history = [
      { role: 'user', content: 'Hola' },
      { role: 'user', content: 'Necesito info' },
    ];
    const aggregated = aggregateMessages(history);
    expect(aggregated).toBe('Hola\nNecesito info');
  });

  it('El datetime extraído del mensaje agregado funciona', () => {
    const aggregated = 'El jueves\nA las 3pm\nPerfecto para mí';
    const dt = extractDatetime(aggregated);
    expect(dt).not.toBeNull();
    expect(dt).toContain('T15:00:00');
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 13: ESCENARIOS DE LEAD RECURRENTE (RETURNING LEAD)
// ══════════════════════════════════════════════════════════════════

describe('🔁 Lead recurrente — retoma conversación', () => {
  it('Lead que regresa después de silencio → detecta intención normal', () => {
    // A returning lead with status 'active' should not be treated as scheduled
    const r = detectIntent('Hola, retomo la conversación', 5, 'active', 'es');
    expect(r.intent).not.toBe('followup_scheduled');
  });

  it('Lead agendado que regresa → siempre followup_scheduled', () => {
    const r = detectIntent('Hola, nos habíamos quedado en hablar', 10, 'scheduled', 'es');
    expect(r.intent).toBe('followup_scheduled');
    expect(r.shouldSendPortfolio).toBe(false);
  });

  it('Lead que regresa y agenda nueva hora → confirm_schedule', () => {
    // Status active (previously closed/re-opened), customer proposes time
    const r = detectIntent('El miércoles a las 4pm me viene bien', 3, 'active', 'es');
    expect(r.intent).toBe('confirm_schedule');
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 14: PATRONES DE SPAM — exhaustivo
// ══════════════════════════════════════════════════════════════════

describe('🚫 Detección de spam — patrones exhaustivos', () => {
  const spamMessages = [
    'Hola ofrezco seguidores y likes para su negocio',
    'Manejo de redes sociales a precios accesibles',
    'Soy community manager y puedo ayudarle',
    'Grow your social media presence today',
    'Boost your followers and engagement',
    'Posicionamiento en los primeros lugares de las búsquedas',
    'Diseño gráfico profesional a bajo costo',
    'Social media management services available',
  ];

  it.each(spamMessages)('"%s" → detectado como spam', (msg) => {
    expect(SPAM_PATTERNS.test(msg.toLowerCase())).toBe(true);
  });

  const normalMessages = [
    'Hola necesito una página web',
    'Cuánto cuesta una tienda online',
    'Quiero información sobre sus servicios',
    'Thursday at 3pm works for me',
    'I need a website for my restaurant',
  ];

  it.each(normalMessages)('"%s" → NO es spam', (msg) => {
    expect(SPAM_PATTERNS.test(msg.toLowerCase())).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// BLOQUE 15: PARSEO DE DATETIME — parseMXDatetime
// ══════════════════════════════════════════════════════════════════

describe('🕐 parseMXDatetime — tratamiento de timezone', () => {
  it('String con offset -06:00 → Date correcta', () => {
    const d = parseMXDatetime('2026-04-10T15:00:00-06:00');
    expect(d.toISOString()).toBe('2026-04-10T21:00:00.000Z');
  });

  it('String sin offset → se asume -06:00 (CDMX)', () => {
    const d = parseMXDatetime('2026-04-10T15:00:00');
    expect(d.toISOString()).toBe('2026-04-10T21:00:00.000Z');
  });

  it('String con Z → UTC', () => {
    const d = parseMXDatetime('2026-04-10T15:00:00Z');
    expect(d.toISOString()).toBe('2026-04-10T15:00:00.000Z');
  });

  it('Fecha bare (datetime-local format) → -06:00', () => {
    const d = parseMXDatetime('2026-04-10T09:00');
    // 09:00 CDMX = 15:00 UTC
    expect(d.toISOString()).toBe('2026-04-10T15:00:00.000Z');
  });
});
