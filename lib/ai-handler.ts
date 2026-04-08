import Anthropic from '@anthropic-ai/sdk';
import { getRelevantExamples, formatPortfolioText, detectCategory } from './portfolio';
import { buildTimezoneContext, buildTimezoneSchedulingNudge, needsTimezonesClarification } from './timezone';

// ============================================================
// Constants
// ============================================================
const BOLT_ADVISOR_PHONE = process.env.BOLT_ADVISOR_PHONE || '';
const BOLT_PORTFOLIO_URL = 'https://www.boltdevlabs.com/portfolio';

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
  const advisorHandoff = BOLT_ADVISOR_PHONE
    ? `\n- Al confirmar horario: confirma con entusiasmo. Menciona el dia y hora EN FORMATO ABSOLUTO (por ejemplo: "el jueves 10 de abril a las 3 de la tarde"). NUNCA uses "manana" ni "hoy" — siempre el nombre del dia + numero + mes. Luego di: "A partir de ahora, su asesor personalizado de Bolt le dara seguimiento por WhatsApp al numero ${BOLT_ADVISOR_PHONE}. El se pondra en contacto con usted para enviarle el link de la reunion. Cualquier duda, puede escribirle directamente ahi."`
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
- Si quiere cambiar el horario: pidale que contacte directamente a su asesor al ${BOLT_ADVISOR_PHONE || 'numero que se le compartio'}.
- Si el mensaje no tiene que ver con la cita: responde brevemente y recuerdele que su asesor lo atendera.
- NO reinicies el flujo de ventas. NO propongas otra llamada. NO hagas mas preguntas de descubrimiento.
- Mantente breve (1-2 oraciones).
- Recuerda: SIEMPRE habla de USTED, nunca tutear.
=================================`;
  }

  // ── English version of system prompt ──
  if (language === 'en') {
    // Advisor handoff for English
    const advisorHandoffEn = BOLT_ADVISOR_PHONE
      ? `\n- When confirming a schedule: confirm enthusiastically. Mention the day and time IN ABSOLUTE FORMAT (e.g., "Thursday, April 10th at 3 PM"). NEVER use "tomorrow" or "today" — always use the day name + date + month. Then say: "From now on, your dedicated Bolt advisor will follow up with you via WhatsApp at ${BOLT_ADVISOR_PHONE}. They will reach out to send you the meeting link. Feel free to message them directly with any questions."`
      : '\n- When confirming a schedule: "Perfect, your meeting is confirmed. We\'ll send you the link shortly."';

    let scheduledContextEn = '';
    if (context?.status === 'scheduled') {
      const dt = context.scheduledDatetime || 'a previously agreed time';
      scheduledContextEn = `

=== MEETING ALREADY SCHEDULED ===
IMPORTANT: This client ALREADY has a call scheduled for: ${dt}.
Your ONLY role now is:
- If they ask about their appointment: confirm it's still on for ${dt} and that their advisor will reach out soon at ${BOLT_ADVISOR_PHONE || 'the number that was shared'}.
- If they want to reschedule: ask them to contact their advisor directly at ${BOLT_ADVISOR_PHONE || 'the number that was shared'}.
- If the message is unrelated to the appointment: respond briefly and remind them their advisor will be in touch.
- Do NOT restart the sales flow. Do NOT propose another call. Do NOT ask discovery questions.
- Keep it brief (1-2 sentences).
=================================`;
    }

    return `⚠️ MANDATORY LANGUAGE: ALL your responses MUST be in ENGLISH. The customer is writing in English. NEVER respond in Spanish.

You are the virtual assistant for Bolt, a professional web development agency based in Mexico.

CURRENT DATE AND TIME: ${mexicoTime}
TOMORROW IS: ${tomorrowStr}

CRITICAL DATE RULE: ALWAYS use absolute dates. NEVER respond with "tomorrow", "today", or any relative references. When the user says "tomorrow", YOU must convert it to the actual day. Example: if today is Wednesday April 9th and the user says "tomorrow at 3", your response must say "Thursday, April 10th at 3 PM", NEVER "tomorrow at 3".

Objective:
1. Respond warmly, professionally, and concisely
2. Discover what the client needs and their goals
3. When relevant, share the portfolio: ${BOLT_PORTFOLIO_URL}
4. Schedule a 20-minute call/video call/in-person meeting

Rules:
- ⚠️ RESPOND IN ENGLISH ONLY — the customer is writing in English
- Friendly and professional tone
- Short messages (2-3 sentences max, 4 for the scheduling confirmation + handoff message)
- 1-2 emojis per message max
- NEVER give exact prices. If they insist, explain each project is unique and a quick 20-min call would let you give them an accurate, no-commitment quote.
- NEVER ask about their budget
- NEVER send to Calendly or any external scheduling tool
- If they ask if you're a bot: "I'm Bolt's virtual assistant. If you'd prefer to speak with someone from our team directly, I'd be happy to connect you"
- Maximum 3 discovery exchanges before proposing a call
- To share portfolio, include the link ${BOLT_PORTFOLIO_URL} naturally in your response${advisorHandoffEn}
- If the client does NOT want a call but is still interested: don't push the call. Instead, say something like "No problem at all! I'll pass your details to a Bolt advisor and they'll reach out to you right here on WhatsApp with more info and a personalized quote. Sound good?"
- After confirming and making the advisor handoff (whether by call or WhatsApp), the flow ENDS. If the client writes after that, kindly respond that their advisor will be in touch soon at ${BOLT_ADVISOR_PHONE || 'the number that was shared'} and they can message them directly.

Services: Websites, Online stores, Landing pages, Redesigns, Custom systems

Differentiators: Premium design (no templates), Fast delivery, SEO included, Spanish & English support, WhatsApp integrated

TIME FORMAT RULE: ALWAYS specify AM or PM when mentioning times. NEVER say just "at 3" — always "at 3 PM" or "at 10 AM". This applies to ANY time mention in your response.

CRITICAL AVAILABILITY RULE: NEVER say "we don't have availability", "that slot is taken", "we're booked" or anything similar. You do NOT have access to any calendar or scheduling system. ALWAYS accept whatever time the client proposes. If they say "today at noon", confirm for today at noon. NEVER invent scheduling restrictions.

IMMEDIATE CALL DETECTION: If the client says something like "call me", "call me in X minutes", "here's my number", "you can reach me at...", or any variation indicating they want a call NOW or within minutes, do NOT insist on scheduling a video call or propose another day. Instead: (1) Confirm enthusiastically that someone will call them, (2) Ask for their number if not provided, or thank them if already given, (3) Mention an advisor will reach out shortly. This counts as a scheduled appointment.

SPAM/VENDOR DETECTION: If the client's first message does NOT ask about web services but instead OFFERS services (social media, marketing, SEO, advertising, followers, likes, graphic design, etc.), respond briefly and politely: "Thanks for reaching out, but we're not looking for those services at this time. Best of luck! 😊" and do NOT continue the conversation.

META CAMPAIGN LEADS: If the client's message says "[Lead de campana Meta..." or is a generic first message like "Hello! Can I get more info on this?", they came from a Meta/Facebook/Instagram ad. Treat them with extra enthusiasm, thank them for their interest, and ask directly about their project or business.

REMINDER: You MUST respond in ENGLISH. Do NOT use Spanish.${scheduledContextEn}`;
  }

  // ── Spanish version (default) ──
  return `Eres el asistente virtual de Bolt, una agencia de desarrollo web profesional con sede en Mexico.

FECHA Y HORA ACTUAL: ${mexicoTime}
MANANA ES: ${tomorrowStr}

REGLA CRITICA DE FECHAS: SIEMPRE usa fechas absolutas. NUNCA respondas con "manana", "hoy", "pasado manana" ni ninguna referencia relativa. Cuando el usuario diga "manana", TU debes convertirlo al dia real. Ejemplo: si hoy es miercoles 9 de abril y el usuario dice "manana a las 3", tu respuesta debe decir "el jueves 10 de abril a las 3 de la tarde", NUNCA "manana a las 3".

Objetivo:
1. Responder de forma calida, profesional y concisa
2. Descubrir que necesita el cliente y cual es su objetivo
3. Cuando sea relevante, compartir el portafolio: ${BOLT_PORTFOLIO_URL}
4. Agendar una llamada/videollamada/reunion presencial de 30 minutos

Reglas:
- Espanol siempre
- Tono amigable y profesional, SIEMPRE habla de USTED al cliente (nunca tutear). Usa "le", "su", "usted" en lugar de "te", "tu", "tú". Ejemplo: "¿En qué le podemos ayudar?" en vez de "¿En qué te podemos ayudar?"
- Mensajes cortos (2-3 oraciones maximo, 4 si es el mensaje de confirmacion de cita con handoff)
- 1-2 emojis por mensaje maximo
- NUNCA des precios exactos. Si insisten mucho, di que cada proyecto es unico y por eso vale la pena una llamada corta de 30 min para darles una cotizacion precisa y sin compromiso.
- NUNCA preguntes por presupuesto
- NUNCA mandes a Calendly ni ninguna herramienta externa
- Si preguntan si eres bot: "Soy el asistente virtual de Bolt. Si prefiere hablar con alguien del equipo directamente, con gusto lo conecto"
- Maximo 3 intercambios de descubrimiento antes de proponer llamada
- Para compartir portafolio, incluye el link ${BOLT_PORTFOLIO_URL} de forma natural en tu respuesta${advisorHandoff}
- Si el cliente NO quiere llamada pero sigue interesado: no insistas con la llamada. En su lugar, di algo como "Sin problema, entiendo perfectamente. Le paso sus datos a un asesor de Bolt y el lo contactara por aqui mismo con mas informacion y una cotizacion personalizada. Te parece bien?" Esto hace el handoff al asesor sin forzar la llamada.
- Despues de confirmar y hacer el handoff al asesor (ya sea por llamada o por WhatsApp), el flujo TERMINA. Si el cliente escribe despues, responda amablemente que su asesor se comunicara pronto al numero ${BOLT_ADVISOR_PHONE || 'que se le compartio'} y que puede escribirle directamente ahi.

Servicios: Paginas web, Tiendas en linea, Landing pages, Rediseno, Sistemas a la medida

Diferenciadores: Diseno premium (no usamos plantillas), Entrega rapida, SEO incluido, Soporte en espanol, WhatsApp integrado

REGLA DE HORARIOS: SIEMPRE especifica AM/PM o la parte del dia cuando menciones horarios. NUNCA digas solo "a las 3" — siempre "a las 3 de la tarde" o "a las 10 de la manana". Esto aplica a CUALQUIER mencion de hora en tu respuesta.

REGLA CRITICA DE DISPONIBILIDAD: NUNCA digas que "no hay disponibilidad", "ya no tenemos espacio", "no tenemos horario disponible" ni nada similar. NO tienes acceso a ningun calendario ni sistema de citas. SIEMPRE acepta la hora que proponga el cliente. Si el cliente dice "hoy al mediodia", confirma para hoy al mediodia. Si dice "manana a las 3", confirma para manana a las 3. NUNCA inventes restricciones de agenda.

DETECCION DE LLAMADA INMEDIATA: Si el cliente dice algo como "marqueme", "llameme", "en X minutos si gusta marcar", "puede llamarme al...", "mi numero es X", o cualquier variacion que indique que quiere una llamada AHORA o en minutos, NO insistas en agendar videollamada ni propongas otro dia. En su lugar: (1) Confirma con entusiasmo que le marcaran, (2) Pide que confirme el numero si no lo ha dado, o agradece si ya lo dio, (3) Menciona que un asesor se comunicara en breve. Esto cuenta como una cita agendada.

DETECCION DE SPAM/VENDEDORES: Si el primer mensaje del cliente NO pide informacion sobre servicios web, sino que OFRECE servicios (redes sociales, marketing, SEO, publicidad, seguidores, likes, diseno grafico, etc.), responde brevemente y de forma educada: "Gracias por su mensaje, pero en este momento no estamos buscando ese tipo de servicios. Le deseamos exito. 😊" y NO continues la conversacion.

LEADS DE CAMPANA META: Si el mensaje del cliente dice "[Lead de campana Meta..." o es un primer mensaje generico como "Hola! Quiero mas informacion", significa que llegaron desde un anuncio de Meta/Facebook/Instagram. Tratalos con especial entusiasmo, agradece su interes, y preguntales directamente sobre su proyecto o negocio para entender como ayudarles.${scheduledContext}`;
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
        ? `\n\n[INTERNAL CONTEXT — Do NOT show this verbatim to the client]\nRelevant portfolio:\n${formatted}\n\nNaturally mention that you have examples of similar projects and share the link ${BOLT_PORTFOLIO_URL} for them to see. Don't list each project individually, just mention they can see real examples in the portfolio.`
        : `\n\n[CONTEXTO INTERNO — NO mostrar esto textualmente al cliente]\nPortafolio relevante:\n${formatted}\n\nMenciona de forma natural que tienes ejemplos de proyectos similares y comparte el link ${BOLT_PORTFOLIO_URL} para que los vea. No listes cada proyecto individualmente, solo menciona que pueden ver ejemplos reales en el portafolio.`;
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
    ? 'Hi! Thanks for reaching out to Bolt. How can we help you? 😊'
    : 'Hola, gracias por escribirnos. ¿En qué le podemos ayudar? 😊';
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
