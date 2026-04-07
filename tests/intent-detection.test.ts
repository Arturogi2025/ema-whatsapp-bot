import { describe, it, expect } from 'vitest';
import { detectIntent } from '../lib/ai-handler';

describe('detectIntent', () => {
  // ── Scheduled conversations always return followup_scheduled ──
  describe('Already scheduled conversations', () => {
    it('returns followup_scheduled regardless of message content', () => {
      const result = detectIntent('Hola, qué tal', 5, 'scheduled', 'es');
      expect(result.intent).toBe('followup_scheduled');
    });

    it('returns followup_scheduled even with schedule-like content', () => {
      const result = detectIntent('El jueves a las 3pm', 5, 'scheduled', 'es');
      expect(result.intent).toBe('followup_scheduled');
    });
  });

  // ── Spam detection (first messages only) ──
  describe('Spam/vendor detection', () => {
    it('detects "seguidores y likes" as spam on first message', () => {
      const result = detectIntent('Hola, ofrezco seguidores y likes para su negocio', 0, 'active', 'es');
      expect(result.intent).toBe('general');
      expect(result.shouldSendPortfolio).toBe(false);
    });

    it('detects "manejo de redes" as spam', () => {
      const result = detectIntent('Buenas, me dedico al manejo de redes sociales', 0, 'active', 'es');
      expect(result.intent).toBe('general');
    });

    it('detects "community manager" as spam', () => {
      const result = detectIntent('Soy community manager y puedo ayudarle con sus redes', 0, 'active', 'es');
      expect(result.intent).toBe('general');
    });

    it('detects English spam "grow your social"', () => {
      const result = detectIntent('We can help grow your social media presence', 0, 'active', 'es');
      expect(result.intent).toBe('general');
    });

    it('detects "posicionamiento en buscadores" as spam', () => {
      const result = detectIntent('Ofrecemos posicionamiento en los primeros lugares de las búsquedas', 0, 'active', 'es');
      expect(result.intent).toBe('general');
    });

    it('does NOT flag spam on later messages (messageCount > 1)', () => {
      const result = detectIntent('También hago manejo de redes', 3, 'active', 'es');
      // After message 1, spam detection is off — this becomes normal intent
      expect(result.intent).not.toBe('general');
    });
  });

  // ── Greeting on first message ──
  describe('Greeting detection', () => {
    it('detects "Hola" as greeting on first message', () => {
      const result = detectIntent('Hola', 0, 'active', 'es');
      expect(result.intent).toBe('greeting');
    });

    it('detects "Buenos días" as greeting', () => {
      const result = detectIntent('Buenos días', 0, 'active', 'es');
      expect(result.intent).toBe('greeting');
    });

    it('does not detect greeting on later messages', () => {
      const result = detectIntent('Hola', 2, 'active', 'es');
      expect(result.intent).not.toBe('greeting');
    });
  });

  // ── Price inquiry ──
  describe('Price inquiry', () => {
    it('detects "cuánto cuesta"', () => {
      const result = detectIntent('Cuánto cuesta una página web?', 1, 'active', 'es');
      expect(result.intent).toBe('price_inquiry');
    });

    it('detects "precio" mention', () => {
      const result = detectIntent('Me puede dar un precio?', 2, 'active', 'es');
      expect(result.intent).toBe('price_inquiry');
    });

    it('detects English "how much"', () => {
      const result = detectIntent('How much does a website cost?', 1, 'active', 'en');
      expect(result.intent).toBe('price_inquiry');
    });
  });

  // ── Immediate call detection (any message count) ──
  describe('Immediate call detection', () => {
    it('detects "márcame" at any message count', () => {
      const result = detectIntent('Sí, márcame', 1, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "llámame"', () => {
      const result = detectIntent('Llámame por favor', 0, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "en 20 minutos"', () => {
      const result = detectIntent('En 20 minutos si gusta marcar', 3, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "si gusta marcar"', () => {
      const result = detectIntent('Si gusta marcar', 2, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "puede marcarme"', () => {
      const result = detectIntent('Puede marcarme', 2, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "le marco" (agent offers to call)', () => {
      const result = detectIntent('Le marco en un momento', 2, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects English "call me"', () => {
      const result = detectIntent('Can you call me?', 1, 'active', 'en');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "in 20 minutes"', () => {
      const result = detectIntent('Call me in 20 minutes', 2, 'active', 'en');
      expect(result.intent).toBe('confirm_schedule');
    });
  });

  // ── Schedule confirmation (messageCount >= 2) ──
  describe('Schedule confirmation', () => {
    it('detects "el jueves a las 3pm" after 2+ messages', () => {
      const result = detectIntent('El jueves a las 3pm', 3, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "mañana a las 11am"', () => {
      const result = detectIntent('Mañana a las 11am', 2, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects "al medio día"', () => {
      const result = detectIntent('El viernes al medio día', 3, 'active', 'es');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('detects English "Thursday at 3pm"', () => {
      const result = detectIntent('Thursday at 3pm', 2, 'active', 'en');
      expect(result.intent).toBe('confirm_schedule');
    });

    it('does NOT detect schedule on first message (avoids false positive)', () => {
      const result = detectIntent('Tengo 12 empleados y necesito página', 0, 'active', 'es');
      expect(result.intent).not.toBe('confirm_schedule');
    });

    it('does NOT detect schedule on second message (need 2+)', () => {
      const result = detectIntent('El martes estaría bien', 1, 'active', 'es');
      expect(result.intent).not.toBe('confirm_schedule');
    });
  });

  // ── Propose call after enough exchanges ──
  describe('Propose call', () => {
    it('proposes call after 4+ exchanges with no project mention', () => {
      const result = detectIntent('Sí, me interesa saber más', 4, 'active', 'es');
      expect(result.intent).toBe('propose_call');
    });
  });

  // ── Discovery (default) ──
  describe('Discovery (default)', () => {
    it('returns discovery for general early messages', () => {
      const result = detectIntent('Tengo un negocio de ropa', 1, 'active', 'es');
      expect(result.intent).toBe('discovery');
    });
  });
});
