import type { Message, Lead, LeadTemperature } from './types';

interface ScoringResult {
  temperature: LeadTemperature;
  score: number; // 0-100
  signals: string[];
}

/**
 * Score a lead based on conversation signals.
 * Returns hot (70-100), warm (40-69), or cold (0-39).
 */
export function scoreLead(
  messages: Message[],
  lead: Lead | null,
): ScoringResult {
  let score = 30; // base score for starting a conversation
  const signals: string[] = [];

  const userMessages = messages.filter(m => m.role === 'user');
  const aiMessages = messages.filter(m => m.role === 'assistant');

  // --- Engagement signals ---

  // Number of user messages (more = more engaged)
  if (userMessages.length >= 5) {
    score += 15;
    signals.push('Alta participación en la conversación');
  } else if (userMessages.length >= 3) {
    score += 8;
    signals.push('Participación moderada');
  }

  // Response ratio (user replied to most AI messages)
  if (aiMessages.length > 0 && userMessages.length > 0) {
    const ratio = userMessages.length / aiMessages.length;
    if (ratio > 0.7) {
      score += 10;
      signals.push('Responde consistentemente');
    }
  }

  // Quick responses (responded within conversation)
  if (userMessages.length >= 2) {
    const firstMsg = new Date(userMessages[0].timestamp);
    const lastMsg = new Date(userMessages[userMessages.length - 1].timestamp);
    const spanMinutes = (lastMsg.getTime() - firstMsg.getTime()) / (1000 * 60);
    if (spanMinutes > 5 && userMessages.length >= 3) {
      score += 5;
      signals.push('Conversación sostenida');
    }
  }

  // --- Intent signals ---
  const allUserText = userMessages.map(m => m.content.toLowerCase()).join(' ');

  // Pricing/budget interest
  if (/precio|costo|cuánto|cuanto|presupuesto|cotiz|inversión|inversion|paquete|plan/.test(allUserText)) {
    score += 15;
    signals.push('Preguntó por precio/inversión');
  }

  // Urgency
  if (/urgente|rápido|rapido|pronto|antes|ya|inmediato|hoy|mañana|esta semana/.test(allUserText)) {
    score += 10;
    signals.push('Muestra urgencia');
  }

  // Project details shared
  if (/negocio|empresa|tienda|marca|producto|servicio|cliente|vend/.test(allUserText)) {
    score += 8;
    signals.push('Compartió detalles del negocio');
  }

  // Scheduling interest
  if (/llamada|llamar|agendar|reunión|reunion|cita|horario|disponib/.test(allUserText)) {
    score += 12;
    signals.push('Interesado en agendar');
  }

  // Positive sentiment
  if (/me interesa|quiero|necesito|busco|me gusta|perfecto|genial|excelente|dale|va|sí|si,|claro/.test(allUserText)) {
    score += 8;
    signals.push('Sentimiento positivo');
  }

  // --- Lead data signals ---
  if (lead) {
    if (lead.status === 'scheduled' || lead.status === 'converted') {
      score += 20;
      signals.push('Ya agendó o se convirtió');
    }
    if (lead.project_type) {
      score += 5;
      signals.push('Tipo de proyecto identificado');
    }
    if (lead.preferred_datetime) {
      score += 10;
      signals.push('Horario preferido definido');
    }
    if (lead.objective) {
      score += 5;
      signals.push('Objetivo claro');
    }
  }

  // --- Negative signals ---

  // Ghost: only 1 message
  if (userMessages.length === 1) {
    score -= 10;
    signals.push('Solo envió un mensaje');
  }

  // No response in a long time (check last message age)
  if (userMessages.length > 0) {
    const lastUserMsg = new Date(userMessages[userMessages.length - 1].timestamp);
    const hoursAgo = (Date.now() - lastUserMsg.getTime()) / (1000 * 60 * 60);
    if (hoursAgo > 48) {
      score -= 15;
      signals.push('Sin respuesta en +48h');
    } else if (hoursAgo > 24) {
      score -= 8;
      signals.push('Sin respuesta en +24h');
    }
  }

  // Negative sentiment
  if (/no me interesa|no gracias|caro|muy caro|no puedo|no tengo|después|despues|luego/.test(allUserText)) {
    score -= 10;
    signals.push('Posible desinterés');
  }

  // Cap score
  score = Math.max(0, Math.min(100, score));

  const temperature: LeadTemperature =
    score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';

  return { temperature, score, signals };
}

export function getTemperatureLabel(temp: LeadTemperature): string {
  return temp === 'hot' ? 'Caliente' : temp === 'warm' ? 'Tibio' : 'Frío';
}

export function getTemperatureColor(temp: LeadTemperature): string {
  return temp === 'hot' ? '#ef4444' : temp === 'warm' ? '#f59e0b' : '#3b82f6';
}

export function getTemperatureEmoji(temp: LeadTemperature): string {
  return temp === 'hot' ? '🔥' : temp === 'warm' ? '🟡' : '🔵';
}
