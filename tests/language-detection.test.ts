import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../lib/ai-handler';

describe('detectLanguage', () => {
  describe('Clear Spanish messages', () => {
    it('detects "Hola, necesito una página web"', () => {
      expect(detectLanguage('Hola, necesito una página web')).toBe('es');
    });

    it('detects "Buenos días, quiero cotizar una tienda"', () => {
      expect(detectLanguage('Buenos días, quiero cotizar una tienda')).toBe('es');
    });

    it('detects "Cuánto cuesta una página"', () => {
      expect(detectLanguage('Cuánto cuesta una página')).toBe('es');
    });

    it('detects "Buenas tardes, me interesa información"', () => {
      expect(detectLanguage('Buenas tardes, me interesa información')).toBe('es');
    });

    it('detects "El jueves a las 3 de la tarde"', () => {
      expect(detectLanguage('El jueves a las 3 de la tarde')).toBe('es');
    });

    it('detects "Estoy manejando, luego le aviso"', () => {
      expect(detectLanguage('Estoy manejando, luego le aviso')).toBe('es');
    });
  });

  describe('Clear English messages', () => {
    it('detects "Hello, I need a website"', () => {
      expect(detectLanguage('Hello, I need a website')).toBe('en');
    });

    it('detects "How much does a website cost?"', () => {
      expect(detectLanguage('How much does a website cost?')).toBe('en');
    });

    it('detects "I am interested in your services"', () => {
      expect(detectLanguage('I am interested in your services')).toBe('en');
    });

    it('detects "Good morning, can you help me with a project?"', () => {
      expect(detectLanguage('Good morning, can you help me with a project?')).toBe('en');
    });

    it('detects "I\'m driving, I\'ll get back to you later"', () => {
      expect(detectLanguage("I'm driving, I'll get back to you later")).toBe('en');
    });

    it('detects "Sounds good, Thursday at 3pm works for me"', () => {
      expect(detectLanguage('Sounds good, Thursday at 3pm works for me')).toBe('en');
    });
  });

  describe('Ambiguous messages default to Spanish', () => {
    it('"Hola" alone defaults to Spanish', () => {
      expect(detectLanguage('Hola')).toBe('es');
    });

    it('"Ok" alone defaults to Spanish', () => {
      expect(detectLanguage('Ok')).toBe('es');
    });

    it('"Si" alone defaults to Spanish', () => {
      expect(detectLanguage('Si')).toBe('es');
    });
  });

  describe('History-based detection for ambiguous messages', () => {
    it('uses English history to resolve ambiguous current message', () => {
      const history = [
        { role: 'user', content: 'Hello, I need a website for my business' },
        { role: 'assistant', content: 'Thanks for reaching out!' },
      ];
      expect(detectLanguage('Yes', history)).toBe('en');
    });

    it('defaults to Spanish when history is also ambiguous', () => {
      const history = [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: '¡Hola!' },
      ];
      expect(detectLanguage('Ok', history)).toBe('es');
    });
  });

  describe('Meta campaign leads', () => {
    it('detects Spanish Meta lead message', () => {
      expect(detectLanguage('[Lead de campaña Meta] Hola, quisiera más información')).toBe('es');
    });

    it('detects English Meta lead message', () => {
      expect(detectLanguage('Hello! Can I get more info on this?')).toBe('en');
    });
  });
});
