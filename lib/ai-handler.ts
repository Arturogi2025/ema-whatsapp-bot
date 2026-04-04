import Anthropic from '@anthropic-ai/sdk';
import { getRelevantExamples, formatPortfolioText, detectCategory } from './portfolio';

// ============================================================
// Constants
// ============================================================
const BOLT_ADVISOR_PHONE = process.env.BOLT_ADVISOR_PHONE || '';
const BOLT_PORTFOLIO_URL = 'https://www.boltdevlabs.com/portfolio';

// ============================================================
// Conversation context (passed from webhook for state-aware responses)
// ============================================================
export interface ConversationContext {
  status: string;                   // 'active' | 'scheduled' | 'closed'
  scheduledDatetime?: string | null; // The datetime the lead previously scheduled
}

// ============================================================
// System prompt — dynamically includes current date/time + context
// ============================================================
function buildSystemPrompt(context?: ConversationContext): string {
  // Current date/time in Mexico City timezone — used for absolute date conversion
  const now = new Date();
  const mexicoTime = now.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Also provide tomorrow's date explicitly so the AI can convert "mañana" correctly
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Advisor handoff instructions
  const advisorHandoff = BOLT_ADVISOR_PHONE
    ? `\n- Al confirmar horario: confirma con entusiasmo. Menciona el dia y hora EN FORMATO ABSOLUTO (por ejemplo: "el jueves 10 de abril a las 3 de la tarde"). NUNCA uses "manana" ni "hoy" — siempre el nombre del dia + numero + mes. Luego di: "A partir de ahora, tu asesor personalizado de Bolt te dara seguimiento por WhatsApp al numero ${BOLT_ADVISOR_PHONE}. El se pondra en contacto contigo para enviarte el link de la reunion. Cualquier duda, puedes escribirle directamente ahi."`
    : '\n- Al confirmar horario: "Perfecto, queda agendado. Te enviamos el link a la brevedad."';

  // Context section for conversations that are already scheduled
  let scheduledContext = '';
  if (context?.status === 'scheduled') {
    const dt = context.scheduledDatetime || 'un horario previamente acordado';
    scheduledContext = `

=== CONVERSACION YA AGENDADA ===
IMPORTANTE: Este cliente YA tiene una llamada agendada para: ${dt}.
Tu UNICO rol ahora es:
- Si pregunta sobre su cita: confirma que sigue en pie para ${dt} y que su asesor se comunicara pronto por el numero ${BOLT_ADVISOR_PHONE || 'que se le compartio'}.
- Si quiere cambiar el horario: pidele que contacte directamente a su asesor al ${BOLT_ADVISOR_PHONE || 'numero que se le compartio'}.
- Si el mensaje no tiene que ver con la cita: responde brevemente y recuerdale que su asesor lo atendera.
- NO reinicies el flujo de ventas. NO propongas otra llamada. NO hagas mas preguntas de descubrimiento.
- Mantente breve (1-2 oraciones).
=================================`;
  }

  return `Eres el asistente virtual de Bolt, una agencia de desarrollo web profesional con sede en Mexico.

FECHA Y HORA ACTUAL: ${mexicoTime}
MANANA ES: ${tomorrowStr}

REGLA CRITICA DE FECHAS: SIEMPRE usa fechas absolutas. NUNCA respondas con "manana", "hoy", "pasado manana" ni ninguna referencia relativa. Cuando el usuario diga "manana", TU debes convertirlo al dia real. Ejemplo: si hoy es miercoles 9 de abril y el usuario dice "manana a las 3", tu respuesta debe decir "el jueves 10 de abril a las 3 de la tarde", NUNCA "manana a las 3".

Objetivo:
1. Responder de forma calida, profesional y concisa
2. Descubrir que necesita el cliente y cual es su objetivo
3. Cuando sea relevante, compartir el portafolio: ${BOLT_PORTFOLIO_URL}
4. Agendar una llamada/videollamada/reunion presencial de 20 minutos

Reglas:
- Espanol siempre (a menos que escriban en ingles)
- Tono amigable y profesional, tutea al cliente
- Mensajes cortos (2-3 oraciones maximo, 4 si es el mensaje de confirmacion de cita con handoff)
- 1-2 emojis por mensaje maximo
- NUNCA des precios exactos. Si insisten mucho, di que cada proyecto es unico y por eso vale la pena una llamada corta de 20 min para darles una cotizacion precisa y sin compromiso.
- NUNCA preguntes por presupuesto
- NUNCA mandes a Calendly ni ninguna herramienta externa
- Si preguntan si eres bot: "Soy el asistente virtual de Bolt. Si prefieres hablar con alguien del equipo directamente, con gusto te conecto 😊"
- Maximo 3 intercambios de descubrimiento antes de proponer llamada
- Para compartir portafolio, incluye el link ${BOLT_PORTFOLIO_URL} de forma natural en tu respuesta${advisorHandoff}
- Despues de confirmar y hacer el handoff al asesor, el flujo TERMINA. Si el cliente escribe despues, responde amablemente que su asesor se comunicara pronto al numero ${BOLT_ADVISOR_PHONE || 'que se le compartio'} y que puede escribirle directamente ahi.

Servicios: Paginas web, Tiendas en linea, Landing pages, Rediseno, Sistemas a la medida

Diferenciadores: Diseno premium (no usamos plantillas), Entrega rapida, SEO incluido, Soporte en espanol, WhatsApp integrado${scheduledContext}`;
}

// ============================================================
// Response types
// ============================================================
export interface AIResponse {
  text: string;
  intent:
    | 'greeting'
    | 'discovery'
    | 'portfolio'
    | 'propose_call'
    | 'confirm_schedule'
    | 'followup_scheduled'
    | 'price_inquiry'
    | 'general';
  shouldSendPortfolio: boolean;
  detectedProjectType: string | null;
  detectedDatetime: string | null;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================
// Intent detection — patterns
// ============================================================

const GREETING_PATTERNS =
  /^(hola|hi|hello|hey|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|que\s*tal|saludos|buen\s*d[ií]a)/i;

const PROJECT_KEYWORDS = [
  'pagina web', 'página web', 'sitio web', 'tienda en linea', 'tienda en línea',
  'tienda online', 'landing', 'landing page', 'ecommerce', 'e-commerce',
  'rediseño', 'rediseno', 'sistema', 'aplicación', 'aplicacion', 'app',
  'tienda', 'web',
];

// Price / budget inquiry keywords
const PRICE_PATTERNS =
  /(?:cu[aá]nto\s+(?:cuesta|cobran|sale|costo|vale)|precio|costo|tarifa|cotizaci[oó]n|presupuesto|inversi[oó]n|rangos?\s+de\s+precio)/i;

/**
 * Schedule pattern — CONSERVATIVE to avoid false positives.
 *
 * Matches:
 *   - Day names: lunes, martes, ... (unambiguous)
 *   - "mañana", "hoy", "pasado mañana" (standalone temporal words)
 *   - Time with "a las": "a las 3", "a las 10:30 de la noche"
 *   - Explicit time: "3pm", "10am", "8:30pm", "14:00"
 *   - Full date: "15 de abril"
 *
 * Does NOT match:
 *   - Standalone numbers like "30", "12", "5000"
 *   - Vague patterns like "próxima semana", "siguiente"
 */
const SCHEDULE_PATTERNS =
  /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b|\b(?:ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)\b|(?:a\s+las?\s+)\d{1,2}(?::\d{2})?(?:\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche)))?|\b\d{1,2}:\d{2}\b(?:\s*(?:am|pm|hrs?))?|\b\d{1,2}\s*(?:am|pm)\b|\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

// ============================================================
// Intent detection logic
// ============================================================
function detectIntent(
  text: string,
  messageCount: number,
  conversationStatus?: string
): { intent: AIResponse['intent']; shouldSendPortfolio: boolean } {
  const lower = text.toLowerCase();

  // ── If conversation is already scheduled, everything is followup ──
  if (conversationStatus === 'scheduled') {
    return { intent: 'followup_scheduled', shouldSendPortfolio: false };
  }

  // ── First message → greeting ──
  if (messageCount === 0 && GREETING_PATTERNS.test(lower)) {
    return { intent: 'greeting', shouldSendPortfolio: false };
  }

  // ── Price inquiry (detect before schedule to avoid false positives) ──
  if (PRICE_PATTERNS.test(lower)) {
    return { intent: 'price_inquiry', shouldSendPortfolio: false };
  }

  // ── Schedule confirmation ──
  // Only detect scheduling after at least 2 message exchanges to avoid
  // false positives on early messages (e.g., "tengo 12 empleados").
  // messageCount uses the value BEFORE saving the current user message,
  // so messageCount >= 2 means this is at least the user's 2nd message.
  if (messageCount >= 2 && SCHEDULE_PATTERNS.test(lower)) {
    return { intent: 'confirm_schedule', shouldSendPortfolio: false };
  }

  // ── Project mentioned ──
  const mentionsProject = PROJECT_KEYWORDS.some(kw => lower.includes(kw));
  if (mentionsProject) {
    if (messageCount >= 2) {
      return { intent: 'propose_call', shouldSendPortfolio: true };
    }
    return { intent: 'portfolio', shouldSendPortfolio: true };
  }

  // ── After enough exchanges, push toward scheduling ──
  if (messageCount >= 4) {
    return { intent: 'propose_call', shouldSendPortfolio: false };
  }

  return { intent: 'discovery', shouldSendPortfolio: false };
}

// ============================================================
// Project type extraction
// ============================================================
function extractProjectType(text: string): string | null {
  for (const kw of PROJECT_KEYWORDS) {
    if (text.toLowerCase().includes(kw)) {
      return detectCategory(text);
    }
  }
  return null;
}

// ============================================================
// Datetime extraction — ordered from most specific to least
// ============================================================
function extractDatetime(text: string): string | null {
  const lower = text.toLowerCase();

  const patterns: RegExp[] = [
    // 1. "el jueves 10 de abril a las 3 de la tarde"
    /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)(?:\s+\d{1,2}(?:\s+de\s+\w+)?)?\s+(?:a\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche))/i,

    // 2. "el jueves a las 3" (day + "a las" + time, no am/pm qualifier)
    /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)(?:\s+\d{1,2}(?:\s+de\s+\w+)?)?\s+(?:a\s+las?\s+)\d{1,2}(?::\d{2})?/i,

    // 3. "15 de abril a las 3 de la tarde"
    /\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:a\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche))?)?/i,

    // 4. "el jueves por la tarde" / "mañana por la noche"
    /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)(?:\s+(?:por\s+la\s+|en\s+la\s+)?(?:ma[nñ]ana|tarde|noche))/i,

    // 5. "el jueves" / "mañana" (day alone)
    /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)/i,

    // 6. "a las 3 de la tarde" (time with qualifier, no day)
    /(?:a\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche))/i,

    // 7. "a las 3" (time without qualifier)
    /(?:a\s+las?\s+)\d{1,2}(?::\d{2})?/i,

    // 8. "3pm", "8:30am" (standalone with am/pm)
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) return match[0].trim();
  }

  return null;
}

// ============================================================
// Main AI handler
// ============================================================
export async function handleAIConversation(
  userMessage: string,
  history: ConversationMessage[],
  conversationMessageCount: number,
  conversationContext?: ConversationContext
): Promise<AIResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey });

  // ── Detect intent ──
  const { intent, shouldSendPortfolio } = detectIntent(
    userMessage,
    conversationMessageCount,
    conversationContext?.status
  );
  const detectedProjectType = extractProjectType(userMessage);
  const detectedDatetime = extractDatetime(userMessage);

  // ── Build portfolio context (internal, for AI personalization) ──
  let portfolioContext = '';
  if (shouldSendPortfolio && detectedProjectType) {
    const examples = await getRelevantExamples(detectedProjectType, 3);
    if (examples.length > 0) {
      const formatted = formatPortfolioText(examples);
      portfolioContext = `\n\n[CONTEXTO INTERNO — NO mostrar esto textualmente al cliente]\nPortafolio relevante:\n${formatted}\n\nMenciona de forma natural que tienes ejemplos de proyectos similares y comparte el link ${BOLT_PORTFOLIO_URL} para que los vea. No listes cada proyecto individualmente, solo menciona que pueden ver ejemplos reales en el portafolio.`;
    }
  }

  // ── Internal nudges based on intent ──
  let intentNudge = '';

  switch (intent) {
    case 'propose_call':
      intentNudge =
        '\n\n[CONTEXTO INTERNO] Ya llevas varios intercambios con este lead. Es momento de proponer una llamada/videollamada de 20 min de forma natural y amigable. Pregunta que dia y hora le funciona.';
      break;

    case 'confirm_schedule':
      intentNudge =
        '\n\n[CONTEXTO INTERNO] El cliente parece estar confirmando un dia y hora para la llamada. Confirma con entusiasmo usando FECHA ABSOLUTA completa (dia de la semana + numero + mes + hora). Haz el handoff al asesor segun las reglas y cierra el flujo.';
      break;

    case 'followup_scheduled':
      intentNudge =
        '\n\n[CONTEXTO INTERNO] Este cliente YA tiene cita agendada. Responde brevemente confirmando que su cita sigue en pie y que su asesor se comunicara pronto. NO reinicies el flujo de ventas. NO hagas preguntas de descubrimiento.';
      break;

    case 'price_inquiry':
      intentNudge =
        '\n\n[CONTEXTO INTERNO] El cliente esta preguntando por precios. NUNCA des un numero. Explica amablemente que cada proyecto es unico y que en una llamada corta de 20 min puedes darle una cotizacion precisa sin compromiso. Si ya sabes su tipo de proyecto, menciona que has hecho proyectos similares y comparte el portafolio.';
      break;
  }

  // ── Dynamic max_tokens based on intent ──
  // confirm_schedule needs more space for handoff message
  // followup_scheduled is always short
  let maxTokens: number;
  switch (intent) {
    case 'confirm_schedule':
      maxTokens = 350;
      break;
    case 'followup_scheduled':
      maxTokens = 200;
      break;
    default:
      maxTokens = 250;
  }

  // ── Build messages array for Claude ──
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: userMessage,
    },
  ];

  // ── Call Claude ──
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    temperature: 0.6,
    system: buildSystemPrompt(conversationContext) + portfolioContext + intentNudge,
    messages,
  });

  // ── Extract text ──
  const textBlock = response.content.find(block => block.type === 'text');
  const text = textBlock
    ? textBlock.text
    : 'Hola, gracias por escribirnos. ¿En qué te podemos ayudar? 😊';

  return {
    text,
    intent,
    shouldSendPortfolio,
    detectedProjectType,
    detectedDatetime,
  };
}
