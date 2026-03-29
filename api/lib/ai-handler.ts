import Anthropic from '@anthropic-ai/sdk';
import { getRelevantExamples, formatPortfolioText, detectCategory } from './portfolio';

// ============================================================
// System prompt — EXACTAMENTE como está en el PDF (Sección 5)
// ============================================================
const SYSTEM_PROMPT = `Eres el asistente virtual de Bolt, una agencia de desarrollo web profesional con sede en Mexico.

Objetivo:
1. Responder de forma calida, profesional y concisa
2. Descubrir que necesita el cliente y cual es su objetivo
3. Compartir ejemplos relevantes del portafolio
4. Agendar una llamada/videollamada/reunion presencial de 20 minutos

Reglas:
- Espanol siempre (a menos que escriban en ingles)
- Tono amigable y profesional, tutea al cliente
- Mensajes cortos (2-3 oraciones maximo)
- 1-2 emojis por mensaje
- NUNCA des precios exactos
- NUNCA preguntes por presupuesto
- NUNCA mandes a Calendly o similar
- Si preguntan si eres bot: "Soy el asistente virtual de Bolt. Si prefieres hablar con alguien del equipo directamente, con gusto te conecto"
- Maximo 3 preguntas antes de proponer llamada
- Al confirmar horario: "Perfecto, queda agendado. Te enviamos el link a la brevedad."
- Despues de confirmar, el flujo TERMINA

Servicios: Paginas web, Tiendas en linea, Landing pages, Rediseno, Sistemas a la medida

Diferenciadores: Diseno premium (no plantillas), Entrega rapida, SEO, Soporte en espanol, WhatsApp integrado

Portafolio: Selecciona 2-3 ejemplos relevantes segun tipo de proyecto mencionado.`;

// ============================================================
// Response types
// ============================================================
export interface AIResponse {
  text: string;
  intent: 'greeting' | 'discovery' | 'portfolio' | 'propose_call' | 'confirm_schedule' | 'general';
  shouldSendPortfolio: boolean;
  detectedProjectType: string | null;
  detectedDatetime: string | null;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================
// Intent detection helpers
// ============================================================
const GREETING_PATTERNS = /^(hola|hi|hello|hey|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|que\s*tal|saludos|buen\s*d[ií]a)/i;

const PROJECT_KEYWORDS = [
  'pagina web', 'página web', 'sitio web', 'tienda', 'landing',
  'ecommerce', 'e-commerce', 'rediseño', 'rediseno', 'sistema',
  'aplicación', 'aplicacion', 'app', 'web', 'online',
];

const SCHEDULE_PATTERNS = /(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|esta\s+semana|pr[oó]xim[ao]|siguiente|\d{1,2}(?:\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche)))|\d{1,2}[:\s]\d{2})/i;

function detectIntent(
  text: string,
  messageCount: number
): { intent: AIResponse['intent']; shouldSendPortfolio: boolean } {
  const lower = text.toLowerCase();

  // First message is likely a greeting
  if (messageCount === 0 && GREETING_PATTERNS.test(lower)) {
    return { intent: 'greeting', shouldSendPortfolio: false };
  }

  // Check for scheduling (day/time mentioned)
  if (SCHEDULE_PATTERNS.test(lower)) {
    return { intent: 'confirm_schedule', shouldSendPortfolio: false };
  }

  // Check if they describe a project
  const mentionsProject = PROJECT_KEYWORDS.some(kw => lower.includes(kw));
  if (mentionsProject) {
    // If we've had enough exchanges, propose call alongside portfolio
    if (messageCount >= 2) {
      return { intent: 'propose_call', shouldSendPortfolio: true };
    }
    return { intent: 'portfolio', shouldSendPortfolio: true };
  }

  // After 3+ exchanges, push toward scheduling
  if (messageCount >= 4) {
    return { intent: 'propose_call', shouldSendPortfolio: false };
  }

  return { intent: 'discovery', shouldSendPortfolio: false };
}

function extractProjectType(text: string): string | null {
  for (const kw of PROJECT_KEYWORDS) {
    if (text.toLowerCase().includes(kw)) {
      return detectCategory(text);
    }
  }
  return null;
}

function extractDatetime(text: string): string | null {
  const match = text.match(SCHEDULE_PATTERNS);
  return match ? match[0] : null;
}

// ============================================================
// Main AI handler
// ============================================================
export async function handleAIConversation(
  userMessage: string,
  history: ConversationMessage[],
  conversationMessageCount: number
): Promise<AIResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey });

  // Detect intent before calling the AI
  const { intent, shouldSendPortfolio } = detectIntent(
    userMessage,
    conversationMessageCount
  );
  const detectedProjectType = extractProjectType(userMessage);
  const detectedDatetime = extractDatetime(userMessage);

  // Build portfolio context if needed
  let portfolioContext = '';
  if (shouldSendPortfolio && detectedProjectType) {
    const examples = await getRelevantExamples(detectedProjectType, 3);
    if (examples.length > 0) {
      const formatted = formatPortfolioText(examples);
      portfolioContext = `\n\n[CONTEXTO INTERNO — NO mostrar esto al cliente textualmente, usa la info para personalizar tu respuesta]\nPortafolio relevante disponible:\n${formatted}\n\nIncluye una mención natural de que tienes ejemplos para compartir. Los ejemplos se enviarán como mensajes separados automáticamente.`;
    }
  }

  // Schedule nudge for conversations that are getting long
  let scheduleNudge = '';
  if (intent === 'propose_call') {
    scheduleNudge = '\n\n[CONTEXTO INTERNO] Ya llevas varios intercambios. Propón una llamada/videollamada de 20 min de forma natural. Pregunta qué día y hora le funciona.';
  }

  if (intent === 'confirm_schedule') {
    scheduleNudge = '\n\n[CONTEXTO INTERNO] El cliente parece estar confirmando un horario. Confirma con entusiasmo: "Perfecto, queda agendado. Te enviamos el link a la brevedad." y cierra el flujo.';
  }

  // Build messages array for Claude
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    // Include conversation history for context
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    // Current message with internal context appended
    {
      role: 'user' as const,
      content: userMessage,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 150,
    temperature: 0.6,
    system: SYSTEM_PROMPT + portfolioContext + scheduleNudge,
    messages,
  });

  // Extract text from response
  const textBlock = response.content.find(block => block.type === 'text');
  const text = textBlock ? textBlock.text : 'Hola, gracias por escribirnos. ¿En qué te podemos ayudar? 😊';

  return {
    text,
    intent,
    shouldSendPortfolio,
    detectedProjectType,
    detectedDatetime,
  };
}
