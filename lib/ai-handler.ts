import Anthropic from '@anthropic-ai/sdk';
import { getRelevantExamples, formatPortfolioText, detectCategory } from './portfolio';
import { buildTimezoneContext, buildTimezoneSchedulingNudge, needsTimezonesClarification } from './timezone';

// ============================================================
// Constants
// ============================================================
const EMA_ADVISOR_PHONE = process.env.EMA_ADVISOR_PHONE || '';
const EMA_APP_URL = 'https://ema.app';

// ============================================================
// Language detection
// ============================================================

/** Common English words/patterns that indicate the message is in English */
const ENGLISH_INDICATORS = [
  /\b(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))\b/i,
  /\b(?:i\s+(?:want|need|would|am|have|can)|i'm|i've|i'll|i'd)\b/i,
  /\b(?:how\s+much|can\s+you|do\s+you|are\s+you|what\s+(?:is|are|do|services?))\b/i,
  /\b(?:website|web\s+page|online\s+store|ecommerce|e-commerce|landing\s+page)\b/i,
  /\b(?:please|thanks|thank\s+you|interested|information|info|quote|pricing)\b/i,
  /\b(?:the|and|for|with|this|that|from|have|more|about|your|you)\b/i,
  /\b(?:project|business|company|schedule|call|meeting|appointment|services?|offer)\b/i,
  /\b(?:driving|busy|later|tomorrow|monday|tuesday|wednesday|thursday|friday)\b/i,
  /\b(?:sounds?\s+good|great|awesome|perfect|sure|okay|ok|yes\s+please|no\s+problem|let\s+me\s+know|got\s+it|nice|cool)\b/i,
];

/** Common Spanish words that indicate the message is in Spanish */
const SPANISH_INDICATORS = [
  /\b(?:hola|buenos?\s*d[ií]as?|buenas?\s*(?:tardes?|noches?))\b/i,
  /\b(?:necesito|quiero|tengo|puedo|estoy|somos|tiene|puede)\b/i,
  /\b(?:p[aá]gina|tienda|precio|costo|cu[aá]nto|cotizaci[oó]n)\b/i,
  /\b(?:por\s+favor|gracias|interesado|informaci[oó]n)\b/i,
  /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i,
  /\b(?:ma[nñ]ana|manejando|despu[eé]s|luego|ahorita|momento)\b/i,
];

/**
 * Detect whether a message is in English or Spanish.
 * Also considers conversation history — if customer has been writing in English,
 * continue in English even if current message is ambiguous.
 */
export function detectLanguage(
  text: string,
  history: Array<{ role: string; content: string }> = []
): 'en' | 'es' {
  const englishScore = ENGLISH_INDICATORS.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0), 0
  );
  const spanishScore = SPANISH_INDICATORS.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0), 0
  );

  // Clear winner from current message
  if (englishScore > spanishScore && englishScore >= 2) return 'en';
  if (spanishScore > englishScore && spanishScore >= 2) return 'es';

  // If ambiguous, check recent user messages in history
  const recentUserMsgs = history
    .filter(m => m.role === 'user')
    .slice(-3);

  for (const msg of recentUserMsgs) {
    const histEn = ENGLISH_INDICATORS.reduce(
      (s, p) => s + (p.test(msg.content) ? 1 : 0), 0
    );
    const histEs = SPANISH_INDICATORS.reduce(
      (s, p) => s + (p.test(msg.content) ? 1 : 0), 0
    );
    if (histEn > histEs && histEn >= 2) return 'en';
  }

  // Default to Spanish
  return 'es';
}

// ============================================================
// Auto-pause detection — patterns that should trigger AI pause
// ============================================================

/** Patterns indicating the customer will respond later / is busy */
const DEFER_PATTERNS_ES = [
  /\b(?:luego\s+(?:te|le|les)\s+(?:aviso|digo|escribo|contesto|respondo|marco))\b/i,
  /\b(?:ahorita\s+(?:no\s+puedo|estoy\s+(?:ocupad[oa]|manejando|en\s+(?:junta|reunion|clase|trabajo))))\b/i,
  /\b(?:estoy\s+(?:manejando|ocupad[oa]|en\s+(?:junta|reunion|clase|trabajo|una\s+llamada)))\b/i,
  /\b(?:despu[eé]s\s+(?:te|le|les)\s+(?:aviso|digo|escribo|contesto|respondo|marco))\b/i,
  /\b(?:m[aá]s\s+(?:tarde|al\s+rato)\s+(?:te|le)\s+(?:aviso|escribo|contesto|marco))\b/i,
  /\b(?:te\s+(?:aviso|escribo|marco|contesto)\s+(?:luego|despu[eé]s|m[aá]s\s+(?:tarde|al\s+rato)))\b/i,
  /\b(?:no\s+puedo\s+(?:hablar|contestar|responder)\s+(?:ahorita|ahora|en\s+este\s+momento))\b/i,
  /\b(?:al\s+rato\s+(?:te|le)\s+(?:aviso|escribo|contesto|marco))\b/i,
];

const DEFER_PATTERNS_EN = [
  /\b(?:i'll\s+(?:get\s+back|respond|reply|write|call|message)\s+(?:to\s+you\s+)?later)\b/i,
  /\b(?:(?:i'm|i\s+am)\s+(?:driving|busy|in\s+a\s+meeting|at\s+work|not\s+available))\b/i,
  /\b(?:can(?:'t|not)\s+(?:talk|chat|respond|reply)\s+(?:right\s+now|now|at\s+the\s+moment))\b/i,
  /\b(?:(?:let\s+me|i'll)\s+(?:get\s+back\s+to\s+you|respond|reply)\s+(?:later|tomorrow|soon))\b/i,
  /\b(?:talk\s+(?:to\s+you\s+)?later)\b/i,
  /\b(?:brb|ttyl)\b/i,
];

/**
 * Detect if the customer is deferring / will respond later.
 * Returns a reason string if detected, null otherwise.
 */
export function detectDeferral(text: string, language: 'en' | 'es'): string | null {
  const patterns = language === 'en' ? DEFER_PATTERNS_EN : DEFER_PATTERNS_ES;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return language === 'en'
        ? 'Customer indicated they will respond later'
        : 'Cliente indicó que responderá después';
    }
  }
  return null;
}

// ============================================================
// Conversation context (passed from webhook for state-aware responses)
// ============================================================
export interface ConversationContext {
  status: string;                   // 'active' | 'scheduled' | 'closed'
  scheduledDatetime?: string | null; // The datetime the lead previously scheduled
  isReturningLead?: boolean;         // True if customer is responding after days of silence
  daysSinceLastContact?: number;     // How many days since last interaction
}

// ============================================================
// System prompt — dynamically includes current date/time + context
// ============================================================
function buildSystemPrompt(context?: ConversationContext, language: 'en' | 'es' = 'es'): string {
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
  const advisorHandoff = EMA_ADVISOR_PHONE
    ? `\n- Al confirmar horario: confirma con entusiasmo. Menciona el dia y hora EN FORMATO ABSOLUTO (por ejemplo: "el jueves 10 de abril a las 3 de la tarde"). NUNCA uses "manana" ni "hoy" — siempre el nombre del dia + numero + mes. Luego di: "A partir de ahora, su asesor personalizado de E-MA le dará seguimiento por WhatsApp al número ${EMA_ADVISOR_PHONE}. Él se pondrá en contacto con usted para enviarle el link de la reunión. Cualquier duda, puede escribirle directamente ahí."`
    : '\n- Al confirmar horario: "Perfecto, queda agendado. Te enviamos el link a la brevedad."';

  // Context section for conversations that are already scheduled
  let scheduledContext = '';
  if (context?.status === 'scheduled') {
    const dt = context.scheduledDatetime || 'un horario previamente acordado';
    scheduledContext = `

=== CONVERSACION YA AGENDADA ===
IMPORTANTE: Este cliente YA tiene una llamada agendada para: ${dt}.
Tu UNICO rol ahora es:
- Si pregunta sobre su cita: confirma que sigue en pie para ${dt} y que su asesor se comunicara pronto por el numero ${EMA_ADVISOR_PHONE || 'que se le compartio'}.
- Si quiere cambiar el horario: pidale que contacte directamente a su asesor al ${EMA_ADVISOR_PHONE || 'numero que se le compartio'}.
- Si el mensaje no tiene que ver con la cita: responde brevemente y recuerdele que su asesor lo atendera.
- NO reinicies el flujo de ventas. NO propongas otra llamada. NO hagas mas preguntas de descubrimiento.
- Mantente breve (1-2 oraciones).
- Recuerda: SIEMPRE habla de USTED, nunca tutear.
=================================`;
  }

  // ── English version of system prompt ──
  if (language === 'en') {
    // Advisor handoff for English
    const advisorHandoffEn = EMA_ADVISOR_PHONE
      ? `\n- When confirming a schedule: confirm enthusiastically. Mention the day and time IN ABSOLUTE FORMAT (e.g., "Thursday, April 10th at 3 PM"). NEVER use "tomorrow" or "today" — always use the day name + date + month. Then say: "From now on, your dedicated E-MA advisor will follow up with you via WhatsApp at ${EMA_ADVISOR_PHONE}. They will reach out to send you the meeting link. Feel free to message them directly with any questions."`
      : '\n- When confirming a schedule: "Perfect, your meeting is confirmed. We\'ll send you the link shortly."';

    let scheduledContextEn = '';
    if (context?.status === 'scheduled') {
      const dt = context.scheduledDatetime || 'a previously agreed time';
      scheduledContextEn = `

=== MEETING ALREADY SCHEDULED ===
IMPORTANT: This client ALREADY has a call scheduled for: ${dt}.
Your ONLY role now is:
- If they ask about their appointment: confirm it's still on for ${dt} and that their advisor will reach out soon at ${EMA_ADVISOR_PHONE || 'the number that was shared'}.
- If they want to reschedule: ask them to contact their advisor directly at ${EMA_ADVISOR_PHONE || 'the number that was shared'}.
- If the message is unrelated to the appointment: respond briefly and remind them their advisor will be in touch.
- Do NOT restart the sales flow. Do NOT propose another call. Do NOT ask discovery questions.
- Keep it brief (1-2 sentences).
=================================`;
    }

    return `⚠️ MANDATORY LANGUAGE: ALL your responses MUST be in ENGLISH. The customer is writing in English. NEVER respond in Spanish.

You are the virtual assistant for E-MA, the preventive and corrective maintenance management platform for condominiums by SIHUA Soluciones Integrales.

CURRENT DATE AND TIME: ${mexicoTime}
TOMORROW IS: ${tomorrowStr}

CRITICAL DATE RULE: ALWAYS use absolute dates. NEVER respond with "tomorrow", "today", or any relative references. When the user says "tomorrow", YOU must convert it to the actual day.

ABOUT E-MA:
E-MA is a digital platform that connects residents, condominium managers, and maintenance providers in one place. It manages preventive and corrective maintenance, service history, quotes, and coordination with specialized providers.

CLIENT TYPES — detect automatically:
1. RESIDENT: Lives in a condo, wants to manage maintenance requests and history
2. CONDOMINIUM MANAGER: Manages one or several condos, needs centralized control
3. MAINTENANCE PROVIDER: Specialized company wanting to join E-MA's provider directory

OBJECTIVE:
1. Identify client type (resident, manager, provider)
2. Guide through the corresponding flow
3. Collect: name, email, phone, condo/company name, specific needs
4. Provide plan/pricing info based on profile
5. Schedule a 20-minute demo or call with the E-MA team

Rules:
- ⚠️ RESPOND IN ENGLISH ONLY
- Friendly and professional tone, always use formal address
- Short messages (2-3 sentences max)
- 1-2 emojis per message max
- NEVER give exact prices. Explain it depends on the number of condos and needs, and a 20-min call can prepare a tailored proposal
- NEVER send to Calendly or any external scheduling tool
- If they ask if you're a bot: "I'm E-MA's virtual assistant. If you'd prefer to speak with someone from our team directly, I'd be happy to connect you"
- Maximum 3 discovery exchanges before proposing a call/demo
- For more info: direct them to https://ema.app${advisorHandoffEn}

SERVICES: Preventive & corrective maintenance management, Service history per condo, Certified provider directory, Manager dashboard, Resident app, Reports and tracking

DIFFERENTIATORS: Connects residents + managers + providers on one platform, Digital maintenance history, No paper, no informal WhatsApp, Everything traceable and documented

TIME FORMAT RULE: ALWAYS specify AM or PM. NEVER say just "at 3" — always "at 3 PM" or "at 10 AM".

CRITICAL AVAILABILITY RULE: NEVER say there's no availability. You do NOT have access to any calendar. ALWAYS accept whatever time the client proposes.

REMINDER: You MUST respond in ENGLISH. Do NOT use Spanish.${scheduledContextEn}`;
  }

  // ── Spanish version (default) ──
  return `Eres el asistente virtual de E-MA, la plataforma de gestión de mantenimiento preventivo y correctivo para condominios de SIHUA Soluciones Integrales.

FECHA Y HORA ACTUAL: ${mexicoTime}
MAÑANA ES: ${tomorrowStr}

REGLA CRÍTICA DE FECHAS: SIEMPRE usa fechas absolutas. NUNCA respondas con "mañana", "hoy" ni referencias relativas. Cuando el usuario diga "mañana", TÚ convierte al día real.

SOBRE E-MA:
E-MA es una plataforma digital que conecta a residentes, administradores de condominios y proveedores de mantenimiento en un solo lugar. Permite gestionar mantenimiento preventivo y correctivo, llevar historial de servicios, recibir cotizaciones y coordinar con proveedores especializados (elevadores, bombas, extintores, jardinería, plomería, etc.).

TIPOS DE CLIENTE — detecta automáticamente a cuál pertenece:

01 — RESIDENTE / CONDÓMINO
Persona que vive en un edificio o condominio y quiere resolver o mejorar el mantenimiento de su unidad o áreas comunes.
- Pregunta cuántas unidades tiene su condominio
- Explica cómo E-MA les ayuda a tener historial de servicios, reportar fallas y dar seguimiento
- Menciona el plan para residentes (accesible, ideal para un solo condominio)
- Ofrece demo o llamada de 20 minutos

02 — ADMINISTRADOR DE CONDOMINIOS
Profesional que administra uno o varios condominios. Necesita control, historial y coordinación de proveedores.
- Pregunta cuántos condominios administra
- Explica los planes para múltiples condominios (precio por volumen)
- Menciona funcionalidades clave: panel centralizado, historial por condominio, gestión de proveedores, reportes
- Ofrece demo personalizada o videollamada

03 — PROVEEDOR DE MANTENIMIENTO
Empresa especializada (elevadores, bombas, extintores, plomería, jardinería, limpieza, etc.) que quiere ser parte del directorio de proveedores de E-MA.
- Pregunta su especialidad y zona de cobertura
- Explica cómo funciona: E-MA los conecta con administradores y residentes que necesitan sus servicios
- Menciona que es una fuente de nuevos clientes sin costo inicial
- Agenda reunión técnica de integración

OBJETIVO DEL BOT:
1. Identificar el tipo de cliente (residente, administrador, proveedor)
2. Llevar la conversación por el flujo correspondiente
3. Recopilar: nombre, email, teléfono, nombre del condominio/empresa, necesidades específicas
4. Dar información de planes/precios según el perfil
5. Agendar una demo o llamada de 20 minutos con el equipo de E-MA

REGLAS:
- Español siempre, tono amigable y profesional
- SIEMPRE habla de USTED al cliente (nunca tutear)
- Mensajes cortos (2-3 oraciones máximo)
- 1-2 emojis por mensaje máximo
- NUNCA des precios exactos. Di que depende del número de condominios y necesidades, y que en una llamada de 20 min se puede preparar una propuesta a medida
- NUNCA mandes a Calendly ni herramientas externas de agenda
- Si preguntan si eres bot: "Soy el asistente virtual de E-MA. Si prefiere hablar con alguien del equipo directamente, con gusto le conecto"
- Máximo 3 intercambios de descubrimiento antes de proponer llamada/demo
- Para más info: dirígelos a https://ema.app${advisorHandoff}

SERVICIOS DE E-MA: Gestión de mantenimiento preventivo y correctivo, Historial de servicios por condominio, Directorio de proveedores certificados, Panel para administradores, App para residentes, Reportes y seguimiento

DIFERENCIADORES: Conecta residentes + administradores + proveedores en una sola plataforma, Historial digital de todo el mantenimiento, Sin papel, sin WhatsApp informales, Todo trazable y documentado

REGLA DE HORARIOS: SIEMPRE especifica AM/PM o parte del día. NUNCA digas solo "a las 3" — siempre "a las 3 de la tarde".

REGLA CRÍTICA DE DISPONIBILIDAD: NUNCA digas que no hay disponibilidad. NO tienes acceso a ningún calendario. SIEMPRE acepta el horario que proponga el cliente.${scheduledContext}`;
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
  /** Detected language of the conversation */
  language: 'en' | 'es';
  /** If set, AI should be auto-paused after this response with this reason */
  shouldAutoPause: string | null;
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
  // Spanish
  'pagina web', 'página web', 'sitio web', 'tienda en linea', 'tienda en línea',
  'tienda online', 'landing', 'landing page', 'ecommerce', 'e-commerce',
  'rediseño', 'rediseno', 'sistema', 'aplicación', 'aplicacion', 'app',
  'tienda', 'web',
  // English
  'website', 'web page', 'web site', 'online store', 'web app', 'web application',
  'redesign', 'custom system', 'store', 'shop',
];

// Price / budget inquiry keywords
const PRICE_PATTERNS =
  /(?:cu[aá]nto\s+(?:cuesta|cobran|sale|costo|vale)|precio|costo|tarifa|cotizaci[oó]n|presupuesto|inversi[oó]n|rangos?\s+de\s+precio)/i;

/**
 * Schedule pattern — matches day/time references.
 *
 * Matches:
 *   - Day names: lunes, martes, ... (unambiguous)
 *   - "mañana", "hoy", "pasado mañana" (standalone temporal words)
 *   - Time with "a las": "a las 3", "a las 10:30 de la noche"
 *   - Explicit time: "3pm", "10am", "8:30pm", "14:00"
 *   - Full date: "15 de abril"
 *   - "al medio día" / "mediodía"
 */
export const SCHEDULE_PATTERNS =
  /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b|\b(?:ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)\b|(?:a\s+las?\s+)\d{1,2}(?::\d{2})?(?:\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche)))?|\b\d{1,2}:\d{2}\b(?:\s*(?:am|pm|hrs?))?|\b\d{1,2}\s*(?:am|pm)\b|\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|(?:al\s+)?medio\s*d[ií]a|mediodia/i;

/**
 * Informal scheduling / immediate call request patterns.
 * Matches: "márcame", "llámame", "en 20 minutos", "puede marcar", "si gusta marcar"
 */
export const IMMEDIATE_CALL_PATTERNS_ES =
  /\b(?:m[aá]rc(?:ame|ame|ale|eme|enos|ar)|ll[aá]m(?:ame|ame|ale|eme|enos|ar))\b|\b(?:si\s+(?:gusta|quiere|puede)\s+(?:marcar|llamar))\b|\b(?:en\s+\d{1,3}\s+minutos?\s+(?:si\s+)?(?:gusta|puede|quiere)?\s*(?:marcar|llamar)?)\b|\b(?:puede\s+(?:marcar|llamar)(?:me)?)\b|\b(?:(?:le|les?)\s+(?:marco|llamo|marquemos|llamamos))\b/i;

export const IMMEDIATE_CALL_PATTERNS_EN =
  /\b(?:call\s+me|give\s+me\s+a\s+call|can\s+you\s+call|in\s+\d{1,3}\s+minutes?)\b/i;

/**
 * Spam/vendor detection — matches messages that OFFER services instead of requesting them.
 */
export const SPAM_PATTERNS =
  /\b(?:seguidores|likes|compartidas|referencias\s+a\s+tu\s+p[aá]gina|crecer\s+(?:tus?|sus?)\s+redes|posicion(?:ar|amiento)|primeros?\s+lugares?\s+de\s+(?:las?\s+)?b[uú]squedas?|se\s+realiza\s+primero\s+el\s+trabajo|manejo\s+de\s+redes|community\s+manager|dise[nñ]o\s+gr[aá]fico|social\s+media\s+(?:management|marketing)|boost\s+your\s+(?:followers|likes|engagement)|grow\s+your\s+(?:social|business|brand))\b/i;

// English schedule patterns
const SCHEDULE_PATTERNS_EN =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:tomorrow|today)\b|(?:at\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\b\d{1,2}:\d{2}\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i;

// ============================================================
// Intent detection logic
// ============================================================
export function detectIntent(
  text: string,
  messageCount: number,
  conversationStatus?: string,
  language: 'en' | 'es' = 'es'
): { intent: AIResponse['intent']; shouldSendPortfolio: boolean } {
  const lower = text.toLowerCase();

  // ── If conversation is already scheduled, everything is followup ──
  if (conversationStatus === 'scheduled') {
    return { intent: 'followup_scheduled', shouldSendPortfolio: false };
  }

  // ── Spam/vendor detection (first messages only — someone offering services) ──
  if (messageCount <= 1 && SPAM_PATTERNS.test(lower)) {
    return { intent: 'general' as AIResponse['intent'], shouldSendPortfolio: false };
  }

  // ── First message → greeting ──
  if (messageCount === 0 && GREETING_PATTERNS.test(lower)) {
    return { intent: 'greeting', shouldSendPortfolio: false };
  }

  // ── Price inquiry (detect before schedule to avoid false positives) ──
  const PRICE_PATTERNS_EN = /(?:how\s+much|price|cost|pricing|quote|estimate|budget|rates?|investment)\b/i;
  if (PRICE_PATTERNS.test(lower) || (language === 'en' && PRICE_PATTERNS_EN.test(lower))) {
    return { intent: 'price_inquiry', shouldSendPortfolio: false };
  }

  // ── Immediate call request (any message count — "márcame", "llámame", "en 20 minutos") ──
  const immediateCallMatch = IMMEDIATE_CALL_PATTERNS_ES.test(lower) ||
    (language === 'en' && IMMEDIATE_CALL_PATTERNS_EN.test(lower));
  if (immediateCallMatch) {
    return { intent: 'confirm_schedule', shouldSendPortfolio: false };
  }

  // ── Schedule confirmation ──
  // Only detect scheduling after at least 2 message exchanges to avoid
  // false positives on early messages (e.g., "tengo 12 empleados").
  if (messageCount >= 2) {
    const scheduleMatch = SCHEDULE_PATTERNS.test(lower) ||
      (language === 'en' && SCHEDULE_PATTERNS_EN.test(lower));
    if (scheduleMatch) {
      return { intent: 'confirm_schedule', shouldSendPortfolio: false };
    }
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
export function extractProjectType(text: string): string | null {
  for (const kw of PROJECT_KEYWORDS) {
    if (text.toLowerCase().includes(kw)) {
      return detectCategory(text);
    }
  }
  return null;
}

// ============================================================
// Datetime extraction — returns ISO 8601 absolute date
// ============================================================

/**
 * Convert a relative datetime text like "mañana a las 11am" to an ISO 8601 string.
 * Uses Mexico City timezone as the reference.
 */
export function resolveToAbsoluteDate(rawDatetime: string): string {
  const lower = rawDatetime.toLowerCase().trim();

  // Get current time in Mexico City
  const now = new Date();
  // Create a date object in Mexico City timezone
  const mexicoOffset = getMexicoCityOffset(now);
  const mexicoNow = new Date(now.getTime() + mexicoOffset);

  let targetDate = new Date(mexicoNow);

  // ── Resolve day ──
  const dayNames: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, 'mi\u00e9rcoles': 3, miercoles: 3,
    jueves: 4, viernes: 5, 's\u00e1bado': 6, sabado: 6,
    // English
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  const months: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  // Check for "pasado mañana"
  if (/pasado\s+ma[nñ]ana/.test(lower)) {
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (/\bma[nñ]ana\b/.test(lower) && !/de\s+la\s+ma[nñ]ana/.test(lower)) {
    // "mañana" but NOT "de la mañana" (which means AM)
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (/\btomorrow\b/.test(lower)) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (/\bhoy\b|\btoday\b/.test(lower)) {
    // Keep today
  } else {
    // Check for specific day name
    for (const [dayName, dayNum] of Object.entries(dayNames)) {
      if (lower.includes(dayName)) {
        const currentDay = mexicoNow.getDay();
        let daysAhead = dayNum - currentDay;
        if (daysAhead <= 0) daysAhead += 7; // next occurrence
        targetDate.setDate(targetDate.getDate() + daysAhead);
        break;
      }
    }

    // Check for explicit date like "15 de abril"
    const dateMatch = lower.match(/(\d{1,2})\s+de\s+(\w+)/);
    if (dateMatch) {
      const monthName = dateMatch[2];
      if (months[monthName] !== undefined) {
        targetDate.setMonth(months[monthName]);
        targetDate.setDate(parseInt(dateMatch[1]));
        // If the date is in the past, assume next year
        if (targetDate.getTime() < mexicoNow.getTime() - 24 * 60 * 60 * 1000) {
          targetDate.setFullYear(targetDate.getFullYear() + 1);
        }
      }
    }
  }

  // ── Resolve time ──
  let hours: number | null = null;
  let minutes = 0;

  // "3pm", "11am", "8:30pm"
  const ampmMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i);
  if (ampmMatch) {
    hours = parseInt(ampmMatch[1]);
    minutes = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0;
    const isPM = ampmMatch[3].toLowerCase() === 'pm';
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  }

  // "a las 3 de la tarde", "a las 10 de la mañana"
  if (hours === null) {
    const alasMatch = lower.match(/(?:a\s+las?\s+)(\d{1,2})(?::(\d{2}))?\s*(?:de\s+la\s+(ma[nñ]ana|tarde|noche))?/i);
    if (alasMatch) {
      hours = parseInt(alasMatch[1]);
      minutes = alasMatch[2] ? parseInt(alasMatch[2]) : 0;
      const period = alasMatch[3]?.toLowerCase();
      if (period && (period === 'tarde' || period === 'noche')) {
        if (hours < 12) hours += 12;
      } else if (!period && hours >= 1 && hours <= 7) {
        hours += 12; // Assume PM for ambiguous 1-7
      }
    }
  }

  // "al medio día" / "mediodía"
  if (hours === null && /medio\s*d[ií]a|mediodia/.test(lower)) {
    hours = 12;
    minutes = 0;
  }

  // "at 3", "at 10:30"
  if (hours === null) {
    const atMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (atMatch) {
      hours = parseInt(atMatch[1]);
      minutes = atMatch[2] ? parseInt(atMatch[2]) : 0;
      if (atMatch[3]) {
        const isPM = atMatch[3].toLowerCase() === 'pm';
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
      } else if (hours >= 1 && hours <= 7) {
        hours += 12;
      }
    }
  }

  // "por la tarde" / "por la mañana" without specific time
  if (hours === null) {
    if (/(?:por\s+la\s+|en\s+la\s+)tarde/.test(lower)) hours = 15;
    else if (/(?:por\s+la\s+|en\s+la\s+)noche/.test(lower)) hours = 19;
    else if (/(?:por\s+la\s+|en\s+la\s+)ma[nñ]ana/.test(lower)) hours = 10;
  }

  if (hours !== null) {
    targetDate.setHours(hours, minutes, 0, 0);
  }

  // Return ISO string in Mexico City time (as UTC offset)
  // Format: YYYY-MM-DDTHH:mm:00-06:00 (or -05:00 during DST)
  const offsetHours = Math.round(-mexicoOffset / (60 * 60 * 1000));
  const sign = offsetHours <= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetHours);
  const tzStr = `${sign}${String(absOffset).padStart(2, '0')}:00`;

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const h = String(targetDate.getHours()).padStart(2, '0');
  const m = String(targetDate.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${h}:${m}:00${tzStr}`;
}

/**
 * Get the offset from UTC for Mexico City at a given date (handles DST).
 * Returns offset in milliseconds to ADD to UTC to get Mexico City time.
 */
export function getMexicoCityOffset(date: Date): number {
  // Use Intl to get the actual offset
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const mxStr = date.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const utcDate = new Date(utcStr);
  const mxDate = new Date(mxStr);
  return mxDate.getTime() - utcDate.getTime();
}

export function extractDatetime(text: string): string | null {
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

    // 5. "al medio día" / "mediodía"
    /(?:(?:al\s+)?medio\s*d[ií]a|mediodia)/i,

    // 6. "el jueves" / "mañana" (day alone)
    /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)/i,

    // 7. "a las 3 de la tarde" (time with qualifier, no day)
    /(?:a\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche))/i,

    // 7. "a las 3" (time without qualifier)
    /(?:a\s+las?\s+)\d{1,2}(?::\d{2})?/i,

    // 8. "3pm", "8:30am" (standalone with am/pm)
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const rawDatetime = match[0].trim();
      // Convert to absolute ISO date
      try {
        return resolveToAbsoluteDate(rawDatetime);
      } catch {
        // Fallback: return the raw text if conversion fails
        return rawDatetime;
      }
    }
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
  conversationContext?: ConversationContext,
  options?: { multiPart?: boolean; phone?: string }
): Promise<AIResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey });

  // ── Detect language ──
  const language = detectLanguage(userMessage, history);

  // ── Detect intent ──
  const { intent, shouldSendPortfolio } = detectIntent(
    userMessage,
    conversationMessageCount,
    conversationContext?.status,
    language
  );
  const detectedProjectType = extractProjectType(userMessage);
  const detectedDatetime = extractDatetime(userMessage);

  // ── Check for auto-pause triggers ──
  const deferralReason = detectDeferral(userMessage, language);
  // Detect spam
  const isSpam = conversationMessageCount <= 1 && SPAM_PATTERNS.test(userMessage.toLowerCase());
  // Auto-pause on: schedule confirmed, customer defers, OR spam detected
  const shouldAutoPause = intent === 'confirm_schedule'
    ? (language === 'en' ? 'Call scheduled - AI auto-paused' : 'Llamada agendada - IA pausada automáticamente')
    : isSpam
    ? 'Spam/vendedor detectado - IA pausada'
    : deferralReason;

  // ── Build portfolio context (internal, for AI personalization) ──
  let portfolioContext = '';
  if (shouldSendPortfolio && detectedProjectType) {
    const examples = await getRelevantExamples(detectedProjectType, 3);
    if (examples.length > 0) {
      const formatted = formatPortfolioText(examples);
      portfolioContext = language === 'en'
        ? `\n\n[INTERNAL CONTEXT — Do NOT show this verbatim to the client]\nRelevant portfolio:\n${formatted}\n\nNaturally mention that you have examples of similar projects and share the link ${EMA_APP_URL} for them to see. Don't list each project individually, just mention they can see real examples in the portfolio.`
        : `\n\n[CONTEXTO INTERNO — NO mostrar esto textualmente al cliente]\nPortafolio relevante:\n${formatted}\n\nMenciona de forma natural que tienes ejemplos de proyectos similares y comparte el link ${EMA_APP_URL} para que los vea. No listes cada proyecto individualmente, solo menciona que pueden ver ejemplos reales en el portafolio.`;
    }
  }

  // ── Internal nudges based on intent ──
  let intentNudge = '';

  if (language === 'en') {
    switch (intent) {
      case 'propose_call':
        intentNudge = '\n\n[INTERNAL CONTEXT] You have had several exchanges with this lead. It is time to naturally and friendly propose a 20-min call/video call. Ask what day and time works for them.';
        break;
      case 'confirm_schedule':
        intentNudge = '\n\n[INTERNAL CONTEXT] The client seems to be confirming a day and time for the call. Confirm enthusiastically using FULL ABSOLUTE DATE (day of week + number + month + time). Do the advisor handoff per the rules and close the flow.';
        break;
      case 'followup_scheduled':
        intentNudge = '\n\n[INTERNAL CONTEXT] This client ALREADY has a scheduled appointment. Respond briefly confirming their appointment is still on and their advisor will be in touch soon. Do NOT restart the sales flow. Do NOT ask discovery questions.';
        break;
      case 'price_inquiry':
        intentNudge = '\n\n[INTERNAL CONTEXT] The client is asking about prices. NEVER give a number. Kindly explain each project is unique and a quick 20-min call would let you give them an accurate, no-commitment quote. If you already know their project type, mention you have done similar projects and share the portfolio.';
        break;
    }
  } else {
    switch (intent) {
      case 'propose_call':
        intentNudge =
          '\n\n[CONTEXTO INTERNO] Ya llevas varios intercambios con este lead. Es momento de proponer una llamada/videollamada de 30 min de forma natural y amigable. Pregunta que dia y hora le funciona.';
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
          '\n\n[CONTEXTO INTERNO] El cliente esta preguntando por precios. NUNCA des un numero. Explica amablemente que cada proyecto es unico y que en una llamada corta de 30 min puedes darle una cotizacion precisa sin compromiso. Si ya sabes su tipo de proyecto, menciona que has hecho proyectos similares y comparte el portafolio.';
        break;
    }
  }

  // ── Multi-part nudge for first messages ──
  if (options?.multiPart && conversationMessageCount <= 1) {
    intentNudge += language === 'en'
      ? '\n\n[CRITICAL FORMAT INSTRUCTION] This is the client\'s FIRST message. You MUST structure your response as exactly 2 blocks separated by the delimiter "---" on its own line. Do NOT merge them into one message. Each block becomes a separate WhatsApp message.\n\nBlock 1: Warm greeting + thanks for contacting Bolt (1-2 sentences)\n---\nBlock 2: Ask what project they need (1-2 sentences)\n\nYour response MUST contain "---" as a separator. Example:\nHi! 👋 Thanks for reaching out to Bolt, great to connect with you.\n---\nWhat kind of project do you have in mind? Are you looking for a website, online store, or something different? 🚀'
      : '\n\n[INSTRUCCION CRITICA DE FORMATO] Este es el PRIMER mensaje del cliente. DEBES estructurar tu respuesta en exactamente 2 bloques separados por el delimitador "---" en una linea sola. NO los juntes en un solo mensaje. Cada bloque se enviara como un mensaje WhatsApp separado.\n\nBloque 1: Saludo calido + agradecimiento por contactar a Bolt (1-2 oraciones)\n---\nBloque 2: Pregunta sobre que tipo de proyecto necesita (1-2 oraciones)\n\nTu respuesta DEBE contener "---" como separador. Ejemplo:\n¡Hola! 👋 Muchas gracias por contactar a Bolt, es un placer saludarle.\n---\nCuenteme, ¿que tipo de proyecto tiene en mente? ¿Busca una pagina web, tienda en linea, o algo diferente? 🚀';
  }

  // ── Timezone clarification nudge: when scheduling + foreign timezone ──
  if (intent === 'confirm_schedule' && options?.phone && needsTimezonesClarification(options.phone)) {
    intentNudge += buildTimezoneSchedulingNudge(options.phone, language);
  }

  // ── Deferral nudge: if customer says they'll respond later, be gracious ──
  if (deferralReason) {
    intentNudge += language === 'en'
      ? '\n\n[INTERNAL CONTEXT] The customer indicated they are busy or will respond later. Respond VERY briefly (1 sentence), acknowledge their situation graciously, and let them know you are available whenever they are ready. Do NOT ask questions. Do NOT push for scheduling. Do NOT continue selling.'
      : '\n\n[CONTEXTO INTERNO] El cliente indico que esta ocupado o que respondera despues. Responde MUY brevemente (1 oracion), reconoce su situacion con amabilidad y hazle saber que estamos disponibles cuando guste. NO hagas preguntas. NO insistas con agendar. NO continues vendiendo.';
  }

  // ── Returning lead nudge — extra context when a customer comes back after days ──
  if (conversationContext?.isReturningLead && conversationContext.daysSinceLastContact) {
    const days = conversationContext.daysSinceLastContact;
    intentNudge += language === 'en'
      ? `\n\n[INTERNAL CONTEXT] This is a RETURNING LEAD. The customer has not responded for approximately ${days} day(s) and is now coming back. Be extra warm and welcoming. Do NOT repeat previous questions or information they already gave. Acknowledge that it has been a while in a natural way (e.g., "Great to hear from you again!"). Pick up where the conversation left off. If their project type was already discussed, skip discovery and move toward scheduling.`
      : `\n\n[CONTEXTO INTERNO] Este es un LEAD QUE REGRESA. El cliente no habia respondido en aproximadamente ${days} dia(s) y ahora vuelve a escribir. Se extra calido y acogedor. NO repitas preguntas ni informacion que ya te dieron. Reconoce de forma natural que ha pasado un tiempo (ej: "¡Que gusto saber de usted de nuevo!"). Retoma la conversacion donde se quedo. Si su tipo de proyecto ya se discutio, salta el descubrimiento y avanza hacia agendar.`;
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
  // Note: The current user message may already be in history (saved before history fetch).
  // We deduplicate by removing the last entry if it matches the current message.
  const dedupedHistory = [...history];
  if (
    dedupedHistory.length > 0 &&
    dedupedHistory[dedupedHistory.length - 1].role === 'user' &&
    dedupedHistory[dedupedHistory.length - 1].content === userMessage
  ) {
    dedupedHistory.pop();
  }

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...dedupedHistory.map(msg => ({
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
    system: buildSystemPrompt(conversationContext, language) + portfolioContext + intentNudge + (options?.phone ? buildTimezoneContext(options.phone) : ''),
    messages,
  });

  // ── Extract text ──
  const textBlock = response.content.find(block => block.type === 'text');
  const fallbackText = language === 'en'
    ? 'Hi! Thanks for reaching out to E-MA. How can we help you? 😊'
    : 'Hola, gracias por escribirnos a E-MA. ¿En qué le podemos ayudar? 😊';
  const text = textBlock ? textBlock.text : fallbackText;

  return {
    text,
    intent,
    shouldSendPortfolio,
    detectedProjectType,
    detectedDatetime,
    language,
    shouldAutoPause,
  };
}
