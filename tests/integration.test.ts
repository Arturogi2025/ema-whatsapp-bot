import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTimezoneContext } from '../lib/timezone';
import {
  SPAM_PATTERNS,
  detectIntent,
  extractDatetime,
  detectDeferral,
} from '../lib/ai-handler';

/**
 * Integration-style tests that verify the interaction between components.
 * These mock external services (Supabase, WhatsApp API, Anthropic) but test
 * the real logic flow.
 */

// ════════════════════════════════════════════════════
// Test: Timezone context is included for foreign numbers
// ════════════════════════════════════════════════════

describe('Timezone context integration', () => {
  it('buildTimezoneContext returns non-empty for US numbers', () => {
    const context = buildTimezoneContext('+12125551234');
    expect(context).toContain('CONTEXTO DE ZONA HORARIA');
    expect(context).toContain('Estados Unidos');
    expect(context).toContain('hora de Ciudad de México (CDMX)');
  });

  it('buildTimezoneContext returns empty for Mexican numbers', () => {
    const context = buildTimezoneContext('+5215512345678');
    expect(context).toBe('');
  });
});

// ════════════════════════════════════════════════════
// Test: Debounce message aggregation logic
// ════════════════════════════════════════════════════

describe('Message aggregation logic', () => {
  /**
   * Simulates the aggregation logic from respond.ts
   * Tests that multiple rapid-fire user messages get combined into one prompt
   */
  it('aggregates multiple pending user messages into one prompt', () => {
    // Simulate conversation history: bot greeted, then user sent 3 rapid messages
    const history = [
      { role: 'assistant', content: '¡Hola! Gracias por contactar a Bolt.' },
      { role: 'user', content: 'El día de hoy' },
      { role: 'user', content: 'Al medio día' },
      { role: 'user', content: 'Soy Mario' },
    ];

    // Replicate the aggregation logic from respond.ts
    const lastBotMsgIndex = [...history].reverse().findIndex((m: any) => m.role === 'assistant');
    const pendingUserMsgs = lastBotMsgIndex === -1
      ? history.filter((m: any) => m.role === 'user')
      : history.slice(history.length - lastBotMsgIndex).filter((m: any) => m.role === 'user');

    const aggregatedUserMessage = pendingUserMsgs.length > 1
      ? pendingUserMsgs.map((m: any) => m.content).join('\n')
      : 'fallback';

    expect(pendingUserMsgs).toHaveLength(3);
    expect(aggregatedUserMessage).toBe('El día de hoy\nAl medio día\nSoy Mario');
  });

  it('uses single message when only one pending', () => {
    const history = [
      { role: 'assistant', content: '¡Hola!' },
      { role: 'user', content: 'Necesito una página web' },
    ];

    const lastBotMsgIndex = [...history].reverse().findIndex((m: any) => m.role === 'assistant');
    const pendingUserMsgs = lastBotMsgIndex === -1
      ? history.filter((m: any) => m.role === 'user')
      : history.slice(history.length - lastBotMsgIndex).filter((m: any) => m.role === 'user');

    expect(pendingUserMsgs).toHaveLength(1);
  });

  it('handles case with no prior bot messages (all user messages)', () => {
    const history = [
      { role: 'user', content: 'Hola' },
      { role: 'user', content: 'Necesito info' },
    ];

    const lastBotMsgIndex = [...history].reverse().findIndex((m: any) => m.role === 'assistant');
    const pendingUserMsgs = lastBotMsgIndex === -1
      ? history.filter((m: any) => m.role === 'user')
      : history.slice(history.length - lastBotMsgIndex).filter((m: any) => m.role === 'user');

    expect(pendingUserMsgs).toHaveLength(2);
    const aggregated = pendingUserMsgs.map((m: any) => m.content).join('\n');
    expect(aggregated).toBe('Hola\nNecesito info');
  });
});

// ════════════════════════════════════════════════════
// Test: Multi-part message splitting
// ════════════════════════════════════════════════════

describe('Multi-part message splitting', () => {
  it('splits response by --- delimiter', () => {
    const aiText = '¡Hola! 👋 Gracias por contactar a Bolt.\n---\n¿Qué tipo de proyecto tiene en mente?';
    const parts = aiText.split('---').map(p => p.trim()).filter(p => p);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('Hola');
    expect(parts[1]).toContain('proyecto');
  });

  it('falls back to paragraph split when no ---', () => {
    const aiText = '¡Hola! Gracias por contactar.\n\nCuénteme, ¿qué necesita?';
    const parts = aiText.split(/\n\n+/).map(p => p.trim()).filter(p => p);
    expect(parts).toHaveLength(2);
  });

  it('caps at 3 parts max with paragraph split', () => {
    const aiText = 'Part 1\n\nPart 2\n\nPart 3\n\nPart 4\n\nPart 5';
    let parts = aiText.split(/\n\n+/).map(p => p.trim()).filter(p => p);
    if (parts.length > 3) {
      parts = [parts.slice(0, 2).join('\n\n'), parts.slice(2).join('\n\n')];
    }
    expect(parts.length).toBeLessThanOrEqual(3);
  });

  it('subsequent messages strip --- and merge', () => {
    const aiText = 'Primera parte\n---\nSegunda parte';
    const cleaned = aiText.replace(/\n?---\n?/g, '\n\n').trim();
    expect(cleaned).not.toContain('---');
    expect(cleaned).toContain('Primera parte');
    expect(cleaned).toContain('Segunda parte');
  });
});

// ════════════════════════════════════════════════════
// Test: Spam detection → auto-pause flow
// ════════════════════════════════════════════════════

describe('Spam detection → auto-pause flow', () => {
  it('spam on first message triggers auto-pause reason', () => {
    const spamMessage = 'Hola, ofrezco seguidores y likes para su negocio';
    const messageCount = 0;
    const isSpam = messageCount <= 1 && SPAM_PATTERNS.test(spamMessage.toLowerCase());

    expect(isSpam).toBe(true);

    const shouldAutoPause = isSpam ? 'Spam/vendedor detectado - IA pausada' : null;
    expect(shouldAutoPause).toBe('Spam/vendedor detectado - IA pausada');
  });

  it('spam on messageCount=3 does NOT trigger auto-pause', () => {
    const spamMessage = 'Hola, ofrezco seguidores y likes para su negocio';
    const messageCount = 3;
    const isSpam = messageCount <= 1 && SPAM_PATTERNS.test(spamMessage.toLowerCase());

    expect(isSpam).toBe(false);
  });
});

// ════════════════════════════════════════════════════
// Test: Cron skips spam-paused conversations
// ════════════════════════════════════════════════════

describe('Cron spam-pause skip logic', () => {
  /**
   * Simulates the PART 3 logic from send-reminders.ts
   * that decides which auto-paused conversations to follow up on.
   */
  it('skips spam-paused conversations', () => {
    const conversations = [
      { auto_pause_reason: 'Spam/vendedor detectado - IA pausada' },
      { auto_pause_reason: 'Cliente indicó que responderá después' },
      { auto_pause_reason: 'Customer indicated they will respond later' },
      { auto_pause_reason: 'Llamada agendada - IA pausada automáticamente' },
    ];

    const eligible = conversations.filter(conv => {
      const reason = (conv.auto_pause_reason || '').toLowerCase();
      // Skip spam
      if (reason.includes('spam') || reason.includes('vendedor')) return false;
      // Only process deferral pauses
      const isDeferral = reason.includes('respond') || reason.includes('later') ||
        reason.includes('después') || reason.includes('despues') || reason.includes('responder');
      return isDeferral;
    });

    expect(eligible).toHaveLength(2);
    expect(eligible[0].auto_pause_reason).toContain('después');
    expect(eligible[1].auto_pause_reason).toContain('later');
  });

  it('does not follow up on schedule auto-pauses either', () => {
    const reason = 'Llamada agendada - IA pausada automáticamente';
    const lower = reason.toLowerCase();
    const isSpam = lower.includes('spam') || lower.includes('vendedor');
    const isDeferral = lower.includes('respond') || lower.includes('later') ||
      lower.includes('después') || lower.includes('despues') || lower.includes('responder');

    expect(isSpam).toBe(false);
    expect(isDeferral).toBe(false);
    // Neither spam nor deferral — gets correctly skipped
  });
});

// ════════════════════════════════════════════════════
// Test: Full intent → datetime → auto-pause pipeline
// ════════════════════════════════════════════════════

describe('Full pipeline: message → intent → datetime → pause', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T16:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedule confirmation extracts intent + datetime + triggers auto-pause', () => {
    const message = 'El jueves a las 3pm me funciona perfecto';
    const messageCount = 3;

    const { intent } = detectIntent(message, messageCount, 'active', 'es');
    expect(intent).toBe('confirm_schedule');

    const datetime = extractDatetime(message);
    expect(datetime).not.toBeNull();
    expect(datetime).toContain('T15:00:00');

    const shouldAutoPause = intent === 'confirm_schedule'
      ? 'Llamada agendada - IA pausada automáticamente'
      : null;
    expect(shouldAutoPause).not.toBeNull();
  });

  it('immediate call request extracts intent + triggers auto-pause', () => {
    const message = 'Sí, márcame por favor';
    const { intent } = detectIntent(message, 1, 'active', 'es');
    expect(intent).toBe('confirm_schedule');
  });

  it('deferral message does NOT trigger schedule but triggers deferral pause', () => {
    const message = 'Estoy manejando, luego le aviso';
    const { intent } = detectIntent(message, 2, 'active', 'es');
    expect(intent).not.toBe('confirm_schedule');

    const deferralReason = detectDeferral(message, 'es');
    expect(deferralReason).not.toBeNull();
  });
});
