import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

// Helper: Parse meeting datetime string (ISO and Spanish text)
function parseMeetingTime(datetimeStr: string): Date | null {
  const isoDate = new Date(datetimeStr);
  if (!isNaN(isoDate.getTime()) && datetimeStr.includes('-') && datetimeStr.match(/^\d{4}-/)) {
    return isoDate;
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const months: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };
  let day: number | null = null;
  let month: number | null = null;
  const dateMatch = datetimeStr.match(/(\d{1,2})\s+de\s+(\w+)/i);
  if (dateMatch) {
    const monthName = dateMatch[2].toLowerCase();
    if (months[monthName] !== undefined) { day = parseInt(dateMatch[1]); month = months[monthName]; }
  }
  let hours: number | null = null;
  let minutes = 0;
  if (/medio\s*d[ií]a|mediodia/i.test(datetimeStr)) { hours = 12; minutes = 0; }
  if (hours === null) {
    const time12Match = datetimeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)/i);
    if (time12Match) {
      hours = parseInt(time12Match[1]); minutes = time12Match[2] ? parseInt(time12Match[2]) : 0;
      const isPM = time12Match[3].toLowerCase() === 'pm';
      if (isPM && hours < 12) hours += 12; if (!isPM && hours === 12) hours = 0;
    } else {
      const time24Match = datetimeStr.match(/(\d{1,2}):(\d{2})/);
      if (time24Match) { hours = parseInt(time24Match[1]); minutes = parseInt(time24Match[2]); }
      else { const m = datetimeStr.match(/las?\s+(\d{1,2})/i); if (m) { hours = parseInt(m[1]); if (hours >= 1 && hours <= 7) hours += 12; } }
    }
  }
  if (hours !== null && hours < 12 && /(?:de\s+la\s+)?(?:tarde|noche)/i.test(datetimeStr)) hours += 12;
  if (day !== null && month !== null && hours !== null) {
    const d = new Date(currentYear, month, day, hours, minutes, 0);
    if (d.getTime() < now.getTime() - 86400000) d.setFullYear(currentYear + 1);
    return d;
  }
  if (hours !== null) {
    const d = new Date(now); d.setHours(hours, minutes, 0, 0);
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

function generateSmartFollowup(leadName: string, projectType: string, conversationId: string): string {
  const seed = (leadName + conversationId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hasProject = projectType && projectType !== 'proyecto digital';
  const tWP = [
    `Hola ${leadName}, ¿tuvo oportunidad de pensar en su proyecto de ${projectType}? Tenemos disponibilidad para arrancar pronto. Estamos a sus órdenes. ⚡`,
    `Hola ${leadName}, solo quería dar seguimiento sobre su ${projectType}. ¿Le gustaría que le envíe más información? 😊`,
    `Hola ${leadName}, quedamos pendientes de platicar sobre su ${projectType}. ¿Qué día le funciona para una llamada rápida? ⚡`,
  ];
  const tG = [
    `Hola ${leadName}, ¿tuvo oportunidad de pensar en su proyecto? Estamos a sus órdenes. ⚡`,
    `Hola ${leadName}, solo quería dar seguimiento. Si tiene preguntas, con gusto le atendemos. 😊`,
    `Hola ${leadName}, nos encantaría platicar en una llamada rápida de 20 min. ¿Hay algún día y hora que le funcione? ⚡`,
  ];
  const templates = hasProject ? tWP : tG;
  return templates[seed % templates.length];
}

async function checkReminderSent(supabase: any, conversationId: string, reminderType: string): Promise<boolean> {
  const { data } = await supabase.from('messages').select('id').eq('conversation_id', conversationId).like('content', `%${reminderType}%`).limit(1);
  return (data && data.length > 0) || false;
}

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getSupabaseAdmin } = await import('@lib/supabase');
    const { sendTemplateMessage, sendTextMessage } = await import('@lib/whatsapp');
    const { notifyFollowupFailure } = await import('@lib/email');
    const { pushFollowupFailure } = await import('@lib/push');

    const supabase = getSupabaseAdmin();
    const now = new Date();
    const results: string[] = [];
    const rateLimitDelay = () => new Promise(resolve => setTimeout(resolve, 1500));

    const mexicoHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }));
    const isBusinessHours = mexicoHour >= 9 && mexicoHour < 21;

    // ── Part 1: Meeting reminders ──
    const { data: scheduledLeads } = await supabase.from('leads_bolt').select('id, name, phone, preferred_datetime, conversation_id, status').eq('status', 'scheduled').not('preferred_datetime', 'is', null);
    for (const lead of scheduledLeads || []) {
      if (!lead.preferred_datetime || !lead.phone) continue;
      const meetingTime = parseMeetingTime(lead.preferred_datetime);
      if (!meetingTime) { results.push(`⚠️ Could not parse datetime for lead ${lead.id}`); continue; }
      const hoursUntilMeeting = (meetingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const leadName = lead.name || 'estimado cliente';
      const timeStr = meetingTime.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' });
      if (hoursUntilMeeting >= 23 && hoursUntilMeeting <= 25 && isBusinessHours) {
        const alreadySent = await checkReminderSent(supabase, lead.conversation_id, 'recordatorio_reunion_24h');
        if (!alreadySent) {
          await rateLimitDelay();
          const result = await sendTemplateMessage(lead.phone, 'recordatorio_reunion_24h', 'es_MX', [{ type: 'body', parameters: [{ type: 'text', text: leadName }, { type: 'text', text: timeStr }] }]);
          if (result.ok) { await supabase.from('messages').insert({ conversation_id: lead.conversation_id, role: 'assistant', content: `[📋 Recordatorio 24h] ${leadName} — ${timeStr}`, timestamp: new Date().toISOString(), sent_by: 'cron' }); results.push(`✅ 24h reminder sent to ${lead.phone}`); }
          else results.push(`❌ 24h reminder failed for ${lead.phone}: ${result.error}`);
        }
      }
      const reminderHour = parseInt(new Date(meetingTime.getTime() - 7200000).toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }));
      if (hoursUntilMeeting >= 1.5 && hoursUntilMeeting <= 2.5 && reminderHour >= 8 && reminderHour < 22) {
        const alreadySent = await checkReminderSent(supabase, lead.conversation_id, 'recordatorio_reunion_2h');
        if (!alreadySent) {
          await rateLimitDelay();
          const result = await sendTemplateMessage(lead.phone, 'recordatorio_reunion_2h', 'es_MX', [{ type: 'body', parameters: [{ type: 'text', text: leadName }, { type: 'text', text: timeStr }] }]);
          if (result.ok) { await supabase.from('messages').insert({ conversation_id: lead.conversation_id, role: 'assistant', content: `[📋 Recordatorio 2h] ${leadName} — ${timeStr}`, timestamp: new Date().toISOString(), sent_by: 'cron' }); results.push(`✅ 2h reminder sent to ${lead.phone}`); }
          else results.push(`❌ 2h reminder failed for ${lead.phone}: ${result.error}`);
        }
      }
    }

    if (!isBusinessHours) return NextResponse.json({ message: `Outside business hours (${mexicoHour}:00 CDMX)`, sent: results, timestamp: now.toISOString() });

    // ── Part 2: Follow-up sequences ──
    const { data: activeConversations } = await supabase.from('conversations').select('id, lead_phone, lead_name, last_customer_message_at, followup_stage, status, ai_paused, message_count').eq('status', 'active').eq('ai_paused', false).not('last_customer_message_at', 'is', null);
    for (const conv of activeConversations || []) {
      if (!conv.last_customer_message_at || !conv.lead_phone || (conv.message_count || 0) < 2) continue;
      const hoursSince = (now.getTime() - new Date(conv.last_customer_message_at).getTime()) / 3600000;
      const daysSince = hoursSince / 24;
      const stage = conv.followup_stage || 0;
      const leadName = conv.lead_name || 'estimado cliente';
      const { data: lastMsg } = await supabase.from('messages').select('role').eq('conversation_id', conv.id).neq('role', 'system').order('timestamp', { ascending: false }).limit(1).single();
      if (!lastMsg || lastMsg.role !== 'assistant') continue;
      const { data: lead } = await supabase.from('leads_bolt').select('project_type').eq('conversation_id', conv.id).single();
      const projectType = lead?.project_type || 'proyecto digital';

      if (stage === 0 && hoursSince >= 2 && hoursSince <= 20) {
        try { await rateLimitDelay(); const txt = generateSmartFollowup(leadName, projectType, conv.id); await sendTextMessage(conv.lead_phone, txt); await supabase.from('messages').insert({ conversation_id: conv.id, role: 'assistant', content: txt, timestamp: new Date().toISOString(), sent_by: 'cron' }); await supabase.from('conversations').update({ followup_stage: 1, updated_at: new Date().toISOString() }).eq('id', conv.id); results.push(`✅ AI follow-up (stage 1) to ${conv.lead_phone}`); } catch (err: any) { results.push(`❌ AI follow-up failed for ${conv.lead_phone}: ${err.message}`); } continue;
      }
      if (stage <= 1 && daysSince >= 1 && daysSince < 2) { await rateLimitDelay(); const r = await sendTemplateMessage(conv.lead_phone, 'seguimiento_sin_respuesta_48h', 'es_MX', [{ type: 'body', parameters: [{ type: 'text', text: leadName }] }]); if (r.ok) { await supabase.from('messages').insert({ conversation_id: conv.id, role: 'assistant', content: `[📋 Seguimiento 24h] ${leadName}`, timestamp: new Date().toISOString(), sent_by: 'template' }); await supabase.from('conversations').update({ followup_stage: 2, updated_at: new Date().toISOString() }).eq('id', conv.id); results.push(`✅ 24h template (stage 2) to ${conv.lead_phone}`); } else results.push(`❌ 24h template failed for ${conv.lead_phone}: ${r.error}`); continue; }
      if (stage <= 2 && daysSince >= 2 && daysSince < 5) { await rateLimitDelay(); const r = await sendTemplateMessage(conv.lead_phone, 'seguimiento_sin_agendar', 'es_MX', [{ type: 'body', parameters: [{ type: 'text', text: leadName }, { type: 'text', text: projectType }] }]); if (r.ok) { await supabase.from('messages').insert({ conversation_id: conv.id, role: 'assistant', content: `[📋 Seguimiento 48h] ${leadName}`, timestamp: new Date().toISOString(), sent_by: 'template' }); await supabase.from('conversations').update({ followup_stage: 3, updated_at: new Date().toISOString() }).eq('id', conv.id); results.push(`✅ 48h template (stage 3) to ${conv.lead_phone}`); } else results.push(`❌ 48h template failed for ${conv.lead_phone}: ${r.error}`); continue; }
      if (stage <= 3 && daysSince >= 5 && daysSince < 10) { await rateLimitDelay(); const r = await sendTemplateMessage(conv.lead_phone, 'solicitud_detalles_proyecto', 'es_MX', [{ type: 'body', parameters: [{ type: 'text', text: leadName }] }]); if (r.ok) { await supabase.from('messages').insert({ conversation_id: conv.id, role: 'assistant', content: `[📋 Seguimiento 5d] ${leadName}`, timestamp: new Date().toISOString(), sent_by: 'template' }); await supabase.from('conversations').update({ followup_stage: 4, updated_at: new Date().toISOString() }).eq('id', conv.id); results.push(`✅ 5-day template (stage 4) to ${conv.lead_phone}`); } else results.push(`❌ 5-day template failed for ${conv.lead_phone}: ${r.error}`); continue; }
      if (stage <= 4 && daysSince >= 10) { await rateLimitDelay(); const r = await sendTemplateMessage(conv.lead_phone, 'reenganche_una_semana', 'es_MX', [{ type: 'body', parameters: [{ type: 'text', text: leadName }] }]); if (r.ok) { await supabase.from('messages').insert({ conversation_id: conv.id, role: 'assistant', content: `[📋 Re-enganche 10d] ${leadName}`, timestamp: new Date().toISOString(), sent_by: 'template' }); await supabase.from('conversations').update({ followup_stage: 5, status: 'closed', updated_at: new Date().toISOString() }).eq('id', conv.id); results.push(`✅ 10-day re-engagement (stage 5) to ${conv.lead_phone} — closed`); } else results.push(`❌ 10-day re-engagement failed for ${conv.lead_phone}: ${r.error}`); continue; }
    }

    // ── Part 3: Deferred conversations ──
    const { data: deferred } = await supabase.from('conversations').select('id, lead_phone, lead_name, last_customer_message_at, auto_pause_reason, followup_stage, message_count').eq('status', 'active').eq('ai_paused', true).not('auto_pause_reason', 'is', null).not('last_customer_message_at', 'is', null);
    for (const conv of deferred || []) {
      if (!conv.last_customer_message_at || !conv.lead_phone) continue;
      const reason = (conv.auto_pause_reason || '').toLowerCase();
      if (reason.includes('spam') || reason.includes('vendedor')) continue;
      const isDeferral = reason.includes('respond') || reason.includes('later') || reason.includes('después') || reason.includes('despues') || reason.includes('responder');
      if (!isDeferral) continue;
      const hoursSince = (now.getTime() - new Date(conv.last_customer_message_at).getTime()) / 3600000;
      const leadName = conv.lead_name || 'estimado cliente';
      if (hoursSince >= 4 && hoursSince <= 20 && (conv.followup_stage || 0) === 0) {
        try { await rateLimitDelay(); const txt = `Hola ${leadName}, esperamos que todo bien. Cuando tenga un momento, aquí estamos para platicar sobre su proyecto. Sin prisa. ⚡`; await sendTextMessage(conv.lead_phone, txt); await supabase.from('messages').insert({ conversation_id: conv.id, role: 'assistant', content: txt, timestamp: new Date().toISOString(), sent_by: 'cron' }); await supabase.from('conversations').update({ ai_paused: false, auto_pause_reason: null, followup_stage: 1, updated_at: new Date().toISOString() }).eq('id', conv.id); results.push(`✅ Deferred follow-up to ${conv.lead_phone} — AI unpaused`); } catch (err: any) { results.push(`❌ Deferred follow-up failed for ${conv.lead_phone}: ${err.message}`); }
      }
    }

    const failures = results.filter(r => r.startsWith('❌')).map(r => { const m = r.match(/❌\s+(.+?)\s+(?:failed\s+for|to)\s+(\S+?)(?:\s+\((.+?)\))?(?::\s+(.*))?$/); return { phone: m?.[2] || 'unknown', name: m?.[3] || 'unknown', stage: m?.[1] || 'unknown', error: m?.[4] || r }; });
    if (failures.length > 0) await Promise.allSettled([notifyFollowupFailure({ failures }), pushFollowupFailure({ count: failures.length })]);

    return NextResponse.json({ message: `Processed ${(scheduledLeads || []).length} leads, ${(activeConversations || []).length} active`, sent: results, failures: failures.length, timestamp: now.toISOString() });
  } catch (error) {
    console.error('[Cron] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
