import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scoreLead } from '@/lib/scoring';
import { detectCity } from '@/lib/geo';
import type { Message, Lead } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();

    // Fetch conversation, messages, and lead in parallel
    const [convRes, msgsRes, leadRes] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', params.id).single(),
      supabase.from('messages').select('*').eq('conversation_id', params.id).order('timestamp', { ascending: true }),
      supabase.from('leads_bolt').select('*').eq('conversation_id', params.id).single(),
    ]);

    if (!convRes.data) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }

    const messages = (msgsRes.data || []) as Message[];
    const lead = leadRes.data as Lead | null;
    const conversation = convRes.data;

    // Score lead
    const { temperature, score, signals } = scoreLead(messages, lead);

    // Detect city
    const city = detectCity(conversation.lead_phone);

    // Count message types
    const userMessages = messages.filter(m => m.role === 'user');
    const aiMessages = messages.filter(m => m.role === 'assistant');

    // Generate AI summary using conversation context
    const allUserText = userMessages.map(m => m.content).join(' ').toLowerCase();

    // Build rule-based insights summary
    const summaryParts: string[] = [];

    if (lead?.project_type) {
      const typeLabels: Record<string, string> = {
        web: 'página web', ecommerce: 'tienda en línea',
        landing: 'landing page', custom: 'sistema a medida',
      };
      summaryParts.push(`Busca ${typeLabels[lead.project_type] || lead.project_type}`);
    }

    if (city) summaryParts.push(`Ubicado en ${city}`);

    if (lead?.objective) {
      summaryParts.push(`Objetivo: ${lead.objective}`);
    }

    if (/precio|costo|cuánto|cuanto|presupuesto|inversión/.test(allUserText)) {
      summaryParts.push('Ha preguntado por precios');
    }

    if (/urgente|rápido|pronto|ya|inmediato/.test(allUserText)) {
      summaryParts.push('Tiene urgencia');
    }

    if (lead?.preferred_datetime) {
      summaryParts.push(`Prefiere contacto: ${lead.preferred_datetime}`);
    }

    // Generate next steps
    const nextSteps: string[] = [];

    if (conversation.status === 'active' && !lead?.preferred_datetime) {
      nextSteps.push('Proponer agendar llamada');
    }

    if (lead?.status === 'scheduled') {
      nextSteps.push('Confirmar cita y enviar recordatorio');
    }

    if (temperature === 'hot' && conversation.status !== 'closed') {
      nextSteps.push('Lead caliente — dar seguimiento inmediato');
    }

    if (temperature === 'cold' && userMessages.length > 0) {
      nextSteps.push('Enviar mensaje de seguimiento');
    }

    if (!lead?.project_type && userMessages.length >= 2) {
      nextSteps.push('Identificar tipo de proyecto');
    }

    if (aiMessages.length >= 3 && !lead?.preferred_datetime) {
      nextSteps.push('Ofrecer agendar llamada de seguimiento');
    }

    if (lead?.project_type && !lead?.objective) {
      nextSteps.push('Profundizar en objetivos del proyecto');
    }

    // Calculate response speed
    let avgResponseMin: number | null = null;
    if (userMessages.length > 0 && aiMessages.length > 0) {
      let totalMs = 0;
      let pairs = 0;
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
          const diff = new Date(messages[i + 1].timestamp).getTime() - new Date(messages[i].timestamp).getTime();
          if (diff > 0 && diff < 1000 * 60 * 60) {
            totalMs += diff;
            pairs++;
          }
        }
      }
      if (pairs > 0) {
        avgResponseMin = Math.round((totalMs / pairs / 1000 / 60) * 10) / 10;
      }
    }

    return NextResponse.json({
      temperature,
      score,
      signals,
      city,
      summary: summaryParts.length > 0 ? summaryParts.join('. ') + '.' : 'Información insuficiente para generar resumen.',
      nextSteps: nextSteps.length > 0 ? nextSteps : ['Continuar la conversación para obtener más datos'],
      avgResponseMin,
      stats: {
        userMessages: userMessages.length,
        aiMessages: aiMessages.length,
        totalMessages: messages.filter(m => m.role !== 'system').length,
      },
    });
  } catch (error) {
    console.error('[Insights] Error:', error);
    return NextResponse.json({ error: 'Error generando insights' }, { status: 500 });
  }
}
