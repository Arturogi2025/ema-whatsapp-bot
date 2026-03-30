import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scoreLead } from '@/lib/scoring';
import type { Message, Lead } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Suggestion {
  label: string;
  message: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();

    const [convRes, msgsRes, leadRes] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', params.id).single(),
      supabase.from('messages').select('*').eq('conversation_id', params.id).order('timestamp', { ascending: true }),
      supabase.from('leads_bolt').select('*').eq('conversation_id', params.id).single(),
    ]);

    if (!convRes.data) {
      return NextResponse.json({ suggestions: [] });
    }

    const conversation = convRes.data;
    const messages = (msgsRes.data || []) as Message[];
    const lead = leadRes.data as Lead | null;
    const { temperature } = scoreLead(messages, lead);

    const userMessages = messages.filter(m => m.role === 'user');
    const aiMessages = messages.filter(m => m.role === 'assistant');
    const lastMsg = messages.filter(m => m.role !== 'system').at(-1);
    const lastUserMsg = userMessages.at(-1);
    const allUserText = userMessages.map(m => m.content).join(' ').toLowerCase();

    const suggestions: Suggestion[] = [];

    // Context-based suggestions depending on conversation state
    const isNewConversation = userMessages.length <= 2;
    const isWaiting = lastMsg?.role === 'user'; // User sent last, we should respond
    const isClosed = conversation.status === 'closed';
    const hasAskedPrice = /precio|costo|cuánto|cuanto|presupuesto|inversión|cotiza/.test(allUserText);
    const hasScheduled = lead?.status === 'scheduled' || /agendar|llamada|cita|reunión/.test(allUserText);
    const mentionsUrgent = /urgente|rápido|pronto|ya|inmediato|hoy/.test(allUserText);
    const mentionsProject = /sitio|página|web|app|tienda|ecommerce|sistema|plataforma/.test(allUserText);

    // ---- CLOSED conversations ----
    if (isClosed) {
      suggestions.push({
        label: '👋 Seguimiento post-cierre',
        message: '¡Hola de nuevo! Espero que estés muy bien. Solo quería saber cómo te ha ido. ¿Hay algo más en lo que podamos ayudarte?',
      });
      suggestions.push({
        label: '⭐ Pedir feedback',
        message: '¡Hola! Nos encantaría saber tu opinión sobre nuestro servicio. ¿Cómo calificarías tu experiencia con Bolt? Tu feedback nos ayuda a mejorar.',
      });
      return NextResponse.json({ suggestions });
    }

    // ---- NEW conversation (1-2 messages) ----
    if (isNewConversation) {
      suggestions.push({
        label: '👋 Dar la bienvenida',
        message: '¡Hola! Bienvenido a Bolt. Gracias por escribirnos. Cuéntame, ¿en qué tipo de proyecto te podemos ayudar?',
      });
      suggestions.push({
        label: '🎯 Preguntar objetivo',
        message: '¡Genial que nos contactes! Para poder asesorarte mejor, ¿podrías contarme cuál es el objetivo principal de tu proyecto? ¿Qué problema quieres resolver?',
      });
      if (mentionsProject) {
        suggestions.push({
          label: '📋 Pedir más detalles',
          message: 'Me encanta tu idea. Para darte una propuesta precisa, necesito conocer: 1) Funcionalidades clave que necesitas, 2) Si tienes alguna referencia visual, y 3) Tu timeline ideal. ¿Me compartes esos datos?',
        });
      }
    }

    // ---- User is WAITING for our response ----
    if (isWaiting && !isNewConversation) {
      // Analyze what the user last asked about
      const lastUserContent = lastUserMsg?.content.toLowerCase() || '';

      if (/precio|costo|cuánto|cuanto|presupuesto|cotiza/.test(lastUserContent)) {
        suggestions.push({
          label: '💰 Responder sobre precio',
          message: 'Los precios dependen del alcance del proyecto. Para sitios web profesionales manejamos desde $15,000 MXN. ¿Te gustaría que agendemos una llamada de 15 min para entender tu proyecto y darte una cotización precisa?',
        });
      }

      if (/tiempo|plazo|cuándo|cuando|demora|tarda/.test(lastUserContent)) {
        suggestions.push({
          label: '⏱️ Responder sobre tiempos',
          message: 'Los tiempos varían según la complejidad: una landing page en 1-2 semanas, un sitio web completo en 3-4 semanas, y proyectos más complejos en 6-8 semanas. ¿Cuál sería tu fecha ideal de lanzamiento?',
        });
      }

      if (/ejemplo|portafolio|trabajo|referencia/.test(lastUserContent)) {
        suggestions.push({
          label: '📁 Compartir portafolio',
          message: 'Con gusto te comparto algunos de nuestros proyectos recientes. ¿Te gustaría ver ejemplos de algún tipo en particular? (landing pages, e-commerce, sitios corporativos, apps)',
        });
      }

      // Generic follow-up if nothing specific matched
      if (suggestions.length === 0) {
        suggestions.push({
          label: '💬 Responder amablemente',
          message: '¡Gracias por compartir esa información! Me ayuda mucho a entender lo que necesitas. Déjame preparar algo para ti.',
        });
      }
    }

    // ---- CONTEXTUAL suggestions (always available) ----
    if (hasAskedPrice && !hasScheduled) {
      suggestions.push({
        label: '📞 Proponer llamada',
        message: 'Para darte la cotización más precisa, me gustaría conocer mejor tu proyecto. ¿Podemos agendar una llamada rápida de 15 minutos? ¿Qué día y hora te funcionan mejor esta semana?',
      });
    }

    if (hasScheduled && lead?.preferred_datetime) {
      suggestions.push({
        label: '✅ Confirmar cita',
        message: `Perfecto, queda confirmada nuestra llamada para ${lead.preferred_datetime}. Te enviaré un recordatorio antes. ¿Hay algo que te gustaría que prepare para la llamada?`,
      });
    }

    if (temperature === 'hot') {
      suggestions.push({
        label: '🔥 Cerrar trato',
        message: 'Veo que tu proyecto tiene todo lo que necesitamos para arrancar. ¿Te gustaría que preparemos la propuesta formal para iniciar esta semana?',
      });
    }

    if (temperature === 'cold' && userMessages.length >= 3) {
      suggestions.push({
        label: '💡 Reactivar interés',
        message: '¡Hola! Solo quería darte seguimiento. Entiendo que puede haber otras prioridades, pero quiero que sepas que estamos listos para ayudarte cuando lo necesites. ¿Hay algo que te detenga o alguna duda que pueda resolver?',
      });
    }

    if (mentionsUrgent) {
      suggestions.push({
        label: '⚡ Respuesta urgente',
        message: 'Entiendo la urgencia de tu proyecto. Tenemos disponibilidad para empezar de inmediato con un equipo dedicado. ¿Cuándo podemos hablar para definir los detalles y arrancar lo antes posible?',
      });
    }

    // Always offer these as fallbacks
    if (suggestions.length < 3 && !isNewConversation) {
      if (!suggestions.some(s => s.label.includes('llamada'))) {
        suggestions.push({
          label: '📅 Agendar llamada',
          message: '¿Te gustaría que agendemos una llamada rápida para platicar sobre tu proyecto? Tengo disponibilidad esta semana. ¿Qué día y hora te funcionan?',
        });
      }
    }

    if (suggestions.length < 4 && aiMessages.length >= 4) {
      suggestions.push({
        label: '📄 Enviar propuesta',
        message: 'Ya tengo una buena idea de lo que necesitas. Estoy preparando una propuesta con alcance, tiempos y presupuesto. ¿A qué correo electrónico te la puedo enviar?',
      });
    }

    // Limit to max 4 suggestions
    return NextResponse.json({ suggestions: suggestions.slice(0, 4) });
  } catch (error) {
    console.error('[Suggestions] Error:', error);
    return NextResponse.json({ suggestions: [] });
  }
}
