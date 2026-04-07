import { describe, it, expect } from 'vitest';
import { detectDeferral } from '../lib/ai-handler';

describe('detectDeferral', () => {
  describe('Spanish deferral patterns', () => {
    it('detects "luego te aviso"', () => {
      expect(detectDeferral('Luego te aviso', 'es')).not.toBeNull();
    });

    it('detects "luego le escribo"', () => {
      expect(detectDeferral('Luego le escribo', 'es')).not.toBeNull();
    });

    it('detects "ahorita no puedo"', () => {
      expect(detectDeferral('Ahorita no puedo, estoy en junta', 'es')).not.toBeNull();
    });

    it('detects "estoy manejando"', () => {
      expect(detectDeferral('Estoy manejando', 'es')).not.toBeNull();
    });

    it('detects "estoy ocupado"', () => {
      expect(detectDeferral('Estoy ocupado ahorita', 'es')).not.toBeNull();
    });

    it('detects "estoy en junta"', () => {
      expect(detectDeferral('Estoy en junta', 'es')).not.toBeNull();
    });

    it('detects "después le aviso"', () => {
      expect(detectDeferral('Después le aviso', 'es')).not.toBeNull();
    });

    it('detects "más tarde te escribo"', () => {
      expect(detectDeferral('Más tarde te escribo', 'es')).not.toBeNull();
    });

    it('detects "te aviso luego"', () => {
      expect(detectDeferral('Te aviso luego', 'es')).not.toBeNull();
    });

    it('detects "al rato te marco"', () => {
      expect(detectDeferral('Al rato te marco', 'es')).not.toBeNull();
    });

    it('detects "no puedo hablar ahorita"', () => {
      expect(detectDeferral('No puedo hablar ahorita', 'es')).not.toBeNull();
    });

    it('returns Spanish reason string', () => {
      const result = detectDeferral('Estoy manejando', 'es');
      expect(result).toContain('después');
    });
  });

  describe('English deferral patterns', () => {
    it('detects "I\'ll get back to you later"', () => {
      expect(detectDeferral("I'll get back to you later", 'en')).not.toBeNull();
    });

    it('detects "I\'m driving"', () => {
      expect(detectDeferral("I'm driving", 'en')).not.toBeNull();
    });

    it('detects "I am busy"', () => {
      expect(detectDeferral('I am busy right now', 'en')).not.toBeNull();
    });

    it('detects "can\'t talk right now"', () => {
      expect(detectDeferral("Can't talk right now", 'en')).not.toBeNull();
    });

    it('detects "talk to you later"', () => {
      expect(detectDeferral('Talk to you later', 'en')).not.toBeNull();
    });

    it('detects "ttyl"', () => {
      expect(detectDeferral('ttyl', 'en')).not.toBeNull();
    });

    it('detects "brb"', () => {
      expect(detectDeferral('brb', 'en')).not.toBeNull();
    });

    it('detects "let me get back to you later"', () => {
      expect(detectDeferral('Let me get back to you later', 'en')).not.toBeNull();
    });

    it('returns English reason string', () => {
      const result = detectDeferral("I'm driving", 'en');
      expect(result).toContain('later');
    });
  });

  describe('Non-deferral messages', () => {
    it('returns null for "Hola, necesito una página"', () => {
      expect(detectDeferral('Hola, necesito una página', 'es')).toBeNull();
    });

    it('returns null for "El jueves a las 3pm"', () => {
      expect(detectDeferral('El jueves a las 3pm', 'es')).toBeNull();
    });

    it('returns null for "Cuánto cuesta?"', () => {
      expect(detectDeferral('Cuánto cuesta?', 'es')).toBeNull();
    });

    it('returns null for "Hello, I need a website"', () => {
      expect(detectDeferral('Hello, I need a website', 'en')).toBeNull();
    });

    it('returns null for "Sounds good"', () => {
      expect(detectDeferral('Sounds good', 'en')).toBeNull();
    });
  });
});
