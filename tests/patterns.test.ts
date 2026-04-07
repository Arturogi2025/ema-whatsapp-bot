import { describe, it, expect } from 'vitest';
import {
  SPAM_PATTERNS,
  IMMEDIATE_CALL_PATTERNS_ES,
  IMMEDIATE_CALL_PATTERNS_EN,
  SCHEDULE_PATTERNS,
} from '../lib/ai-handler';

// ════════════════════════════════════════════════════
// SPAM_PATTERNS — vendor/service offerer detection
// ════════════════════════════════════════════════════

describe('SPAM_PATTERNS', () => {
  describe('Should match (spam messages)', () => {
    const spamMessages = [
      'Hola, ofrezco paquetes de seguidores y likes',
      'Le ayudo con manejo de redes sociales',
      'Soy community manager profesional',
      'Ofrezco diseño gráfico para su empresa',
      'Posicionamiento en primeros lugares de búsquedas',
      'Le ayudo a crecer sus redes sociales',
      'Se realiza primero el trabajo y después se cobra',
      'Social media management services for your brand',
      'We can boost your followers and engagement',
      'Grow your social media presence today',
      'Grow your business with our marketing',
      'Ofrecemos posicionamiento web SEO',
      'Compartidas y referencias a tu página gratis',
    ];

    for (const msg of spamMessages) {
      it(`matches: "${msg.substring(0, 50)}..."`, () => {
        expect(SPAM_PATTERNS.test(msg.toLowerCase())).toBe(true);
      });
    }
  });

  describe('Should NOT match (legitimate messages)', () => {
    const legitimateMessages = [
      'Hola, necesito una página web para mi negocio',
      'Cuánto cuesta una tienda en línea?',
      'Quiero rediseñar mi sitio web',
      'Buenos días, me interesa cotizar',
      'Hello, I need a website',
      'I have a restaurant and need a landing page',
      'El jueves a las 3pm me funciona',
      'Estoy manejando, luego le aviso',
      'Tengo 12 empleados y necesito un sistema',
    ];

    for (const msg of legitimateMessages) {
      it(`does NOT match: "${msg.substring(0, 50)}..."`, () => {
        expect(SPAM_PATTERNS.test(msg.toLowerCase())).toBe(false);
      });
    }
  });
});

// ════════════════════════════════════════════════════
// IMMEDIATE_CALL_PATTERNS — "márcame", "llámame", etc.
// ════════════════════════════════════════════════════

describe('IMMEDIATE_CALL_PATTERNS_ES', () => {
  describe('Should match (immediate call requests)', () => {
    const callRequests = [
      'Márcame',
      'Márcame por favor',
      'Llámame',
      'Llámale a mi número',
      'Si gusta marcar',
      'Si puede marcar',
      'Si quiere llamar',
      'En 20 minutos si gusta marcar',
      'En 5 minutos si gusta',
      'Puede marcarme',
      'Puede llamarme',
      'Le marco en un momento',
      'Le llamo ahorita',
      'Márcale por favor',
    ];

    for (const msg of callRequests) {
      it(`matches: "${msg}"`, () => {
        expect(IMMEDIATE_CALL_PATTERNS_ES.test(msg.toLowerCase())).toBe(true);
      });
    }
  });

  describe('Should NOT match', () => {
    const nonCallMessages = [
      'Hola, necesito una página',
      'El jueves a las 3pm',
      'Cuánto cuesta?',
      'Me interesa',
      'Sí, envíame más información',
    ];

    for (const msg of nonCallMessages) {
      it(`does NOT match: "${msg}"`, () => {
        expect(IMMEDIATE_CALL_PATTERNS_ES.test(msg.toLowerCase())).toBe(false);
      });
    }
  });
});

describe('IMMEDIATE_CALL_PATTERNS_EN', () => {
  describe('Should match', () => {
    const callRequests = [
      'Call me',
      'Call me please',
      'Give me a call',
      'Can you call me?',
      'In 20 minutes',
      'In 5 minutes',
    ];

    for (const msg of callRequests) {
      it(`matches: "${msg}"`, () => {
        expect(IMMEDIATE_CALL_PATTERNS_EN.test(msg.toLowerCase())).toBe(true);
      });
    }
  });
});

// ════════════════════════════════════════════════════
// SCHEDULE_PATTERNS — day/time detection
// ════════════════════════════════════════════════════

describe('SCHEDULE_PATTERNS', () => {
  describe('Day names', () => {
    const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    for (const day of days) {
      it(`matches "${day}"`, () => {
        expect(SCHEDULE_PATTERNS.test(day)).toBe(true);
      });
    }
  });

  describe('Relative days', () => {
    it('matches "mañana"', () => {
      expect(SCHEDULE_PATTERNS.test('mañana')).toBe(true);
    });

    it('matches "hoy"', () => {
      expect(SCHEDULE_PATTERNS.test('hoy')).toBe(true);
    });

    it('matches "pasado mañana"', () => {
      expect(SCHEDULE_PATTERNS.test('pasado mañana')).toBe(true);
    });
  });

  describe('Times', () => {
    it('matches "a las 3"', () => {
      expect(SCHEDULE_PATTERNS.test('a las 3')).toBe(true);
    });

    it('matches "a las 10:30"', () => {
      expect(SCHEDULE_PATTERNS.test('a las 10:30')).toBe(true);
    });

    it('matches "3pm"', () => {
      expect(SCHEDULE_PATTERNS.test('3pm')).toBe(true);
    });

    it('matches "11am"', () => {
      expect(SCHEDULE_PATTERNS.test('11am')).toBe(true);
    });

    it('matches "8:30pm"', () => {
      expect(SCHEDULE_PATTERNS.test('8:30pm')).toBe(true);
    });

    it('matches "mediodía"', () => {
      expect(SCHEDULE_PATTERNS.test('medio día')).toBe(true);
    });
  });

  describe('Full dates', () => {
    it('matches "15 de abril"', () => {
      expect(SCHEDULE_PATTERNS.test('15 de abril')).toBe(true);
    });

    it('matches "1 de mayo"', () => {
      expect(SCHEDULE_PATTERNS.test('1 de mayo')).toBe(true);
    });
  });

  describe('Should NOT match', () => {
    it('does not match "Hola"', () => {
      expect(SCHEDULE_PATTERNS.test('Hola')).toBe(false);
    });

    it('does not match "necesito una página"', () => {
      expect(SCHEDULE_PATTERNS.test('necesito una página')).toBe(false);
    });

    it('does not match "cuánto cuesta"', () => {
      expect(SCHEDULE_PATTERNS.test('cuánto cuesta')).toBe(false);
    });
  });
});
