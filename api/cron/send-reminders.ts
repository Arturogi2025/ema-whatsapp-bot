import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../../lib/supabase';
import { sendTemplateMessage, sendTextMessage } from '../../lib/whatsapp';
import { notifyFollowupFailure } from '../../lib/email';
import { pushFollowupFailure } from '../../lib/push';

/**
 * Cron job: Meeting reminders + Automated follow-up sequences
 *
 * Runs every 30 minutes via Vercel Cron.
 *
 * 1. Meeting reminders (24h and 2h before scheduled calls)
 * 2. AI follow-up within 24h window (if customer hasn't responded in 2+ hours)
 * 3. Template follow-up sequences after 24h window expires:
 *    - Stage 2: ~24h after last customer message (seguimiento_sin_respuesta_48h — renamed but same concept)
 *    - Stage 3: ~48h after (seguimiento_sin_agendar)
 *    - Stage 4: ~5 days after (solicitud_detalles_proyecto)
 *    - Stage 5: ~10 days after (reenganche_una_semana)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const results: string[] = [];

    // ── Business hours check (9 AM – 9 PM Mexico City time) ──
    // Follow-up messages and non-urgent reminders should only be sent during business hours.
    // Meeting reminders (2h before) are exempt — those are time-critical.
    const mexicoHour = parseInt(
      now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false })
    );
    const isBusinessHours = mexicoHour >= 9 && mexicoHour < 21; // 9 AM to 9 PM

    if (!isBusinessHours) {
      results.push(`⏰ Outside business hours (${mexicoHour}:00 CDMX). Only sending time-critical reminders.`);
    }

    // Rate limiting helper — wait between API calls to avoid WhatsApp rate limits
    const rateLimitDelay = () => new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 seconds

    // ════════════════════════════════════════════════════
    // PART 1: Meeting reminders (existing logic)
    // ════════════════════════════════════════════════════
    const { data: scheduledLeads } = await supabase
      .from('leads_bolt')
      .select('id, name, phone, preferred_datetime, conversation_id, status')
      .eq('status', 'scheduled')
      .not('preferred_datetime', 'is', null);

    for (const lead of scheduledLeads || []) {
      if (!lead.preferred_datetime || !lead.phone) continue;

      const meetingTime = parseMeetingTime(lead.preferred_datetime);
      if (!meetingTime) {
        results.push(`⚠️ Could not parse datetime for lead ${lead.id}: "${lead.preferred_datetime}"`);
        continue;
      }

      const hoursUntilMeeting = (meetingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const leadName = lead.name || 'estimado cliente';

      const timeStr = meetingTime.toLocaleTimeString('es-MX', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Mexico_City',
      });

      // 24-hour reminder (sent during business hours only, unless meeting is tomorrow morning)
      if (hoursUntilMeeting >= 23 && hoursUntilMeeting <= 25 && isBusinessHours) {
        const alreadySent = await checkReminderSent(supabase, lead.conversation_id, 'recordatorio_reunion_24h');
        if (!alreadySent) {
          await rateLimitDelay();
          const result = await sendTemplateMessage(
            lead.phone,
            'recordatorio_reunion_24h',
            'es_MX',
            [{
              type: 'body',
              parameters: [
                { type: 'text', text: leadName },
                { type: 'text', text: timeStr },
              ],
            }]
          );

          if (result.ok) {
            await supabase.from('messages').insert({
              conversation_id: lead.conversation_id,
              role: 'assistant',
              content: `[📋 Recordatorio automático 24h] Hola ${leadName}, le recordamos que mañana tiene una reunión agendada con Bolt a las ${timeStr}.`,
              timestamp: new Date().toISOString(),
              sent_by: 'cron',
            });
            results.push(`✅ 24h reminder sent to ${lead.phone} (${leadName})`);
          } else {
            results.push(`❌ 24h reminder failed for ${lead.phone}: ${result.error}`);
          }
        }
      }

      // 2-hour reminder — TIME-CRITICAL, always send regardless of business hours
      if (hoursUntilMeeting >= 1.5 && hoursUntilMeeting <= 2.5) {
        const alreadySent = await checkReminderSent(supabase, lead.conversation_id, 'recordatorio_reunion_2h');
        if (!alreadySent) {
          await rateLimitDelay();
          const result = await sendTemplateMessage(
            lead.phone,
            'recordatorio_reunion_2h',
            'es_MX',
            [{
              type: 'body',
              parameters: [
                { type: 'text', text: leadName },
                { type: 'text', text: timeStr },
              ],
            }]
          );

          if (result.ok) {
            await supabase.from('messages').insert({
              conversation_id: lead.conversation_id,
              role: 'assistant',
              content: `[📋 Recordatorio automático 2h] Hola ${leadName}, le recordamos que su reunión con Bolt está programada para hoy a las ${timeStr}. ¿Nos confirma su asistencia?`,
              timestamp: new Date().toISOString(),
              sent_by: 'cron',
            });
            results.push(`✅ 2h reminder sent to ${lead.phone} (${leadName})`);
          } else {
            results.push(`❌ 2h reminder failed for ${lead.phone}: ${result.error}`);
          }
        }
      }
    }

    // ════════════════════════════════════════════════════
    // PART 2: Automated follow-up sequences
    // ════════════════════════════════════════════════════
    // Only send follow-ups during business hours
    if (!isBusinessHours) {
      return res.status(200).json({
        message: `Outside business hours (${mexicoHour}:00 CDMX). Reminders processed, follow-ups skipped.`,
        sent: results,
        timestamp: now.toISOString(),
      });
    }

    // Only for active conversations where AI is NOT paused and customer hasn't responded recently
    const { data: activeConversations } = await supabase
      .from('conversations')
      .select('id, lead_phone, lead_name, last_customer_message_at, followup_stage, status, ai_paused, message_count')
      .eq('status', 'active')
      .eq('ai_paused', false)
      .not('last_customer_message_at', 'is', null);

    for (const conv of activeConversations || []) {
      if (!conv.last_customer_message_at || !conv.lead_phone) continue;
      // Skip conversations with very few messages (probably just started)
      if ((conv.message_count || 0) < 2) continue;

      const lastCustomerMsg = new Date(conv.last_customer_message_at);
      const hoursSinceLastMsg = (now.getTime() - lastCustomerMsg.getTime()) / (1000 * 60 * 60);
      const daysSinceLastMsg = hoursSinceLastMsg / 24;
      const currentStage = conv.followup_stage || 0;
      const leadName = conv.lead_name || 'estimado cliente';

      // Check if the LAST message in the conversation was from us (not customer)
      // If customer was the last to write, don't follow up — they might be thinking
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('role')
        .eq('conversation_id', conv.id)
        .neq('role', 'system')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      // Only follow up if we (assistant) were the last to write — customer hasn't responded
      if (!lastMsg || lastMsg.role !== 'assistant') continue;

      // Get the lead data for template variables
      const { data: lead } = await supabase
        .from('leads_bolt')
        .select('project_type')
        .eq('conversation_id', conv.id)
        .single();

      const projectType = lead?.project_type || 'proyecto digital';

      // ── Stage 1: AI follow-up within 24h window (2-4 hours after last msg) ──
      if (currentStage === 0 && hoursSinceLastMsg >= 2 && hoursSinceLastMsg <= 20) {
        // Use AI to generate a natural follow-up within the 24h window
        try {
          await rateLimitDelay();
          const followupText = generateSmartFollowup(leadName, projectType, conv.id);
          await sendTextMessage(conv.lead_phone, followupText);
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            role: 'assistant',
            content: followupText,
            timestamp: new Date().toISOString(),
            sent_by: 'cron',
          });
          await supabase
            .from('conversations')
            .update({ followup_stage: 1, updated_at: new Date().toISOString() })
            .eq('id', conv.id);
          results.push(`✅ AI follow-up (stage 1) sent to ${conv.lead_phone} (${leadName})`);
        } catch (err: any) {
          results.push(`❌ AI follow-up failed for ${conv.lead_phone}: ${err.message}`);
        }
        continue;
      }

      // ── Stage 2: 24h template (~24-30h after last customer message) ──
      if (currentStage <= 1 && daysSinceLastMsg >= 1 && daysSinceLastMsg < 2) {
        await rateLimitDelay();
        const result = await sendTemplateMessage(
          conv.lead_phone,
          'seguimiento_sin_respuesta_48h',
          'es_MX',
          [{
            type: 'body',
            parameters: [{ type: 'text', text: leadName }],
          }]
        );

        if (result.ok) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            role: 'assistant',
            content: `[📋 Seguimiento automático 24h] Hola ${leadName}, soy del equipo de Bolt. Le escribimos hace un par de días sobre su proyecto. ¿Sigue interesado en recibir una cotización sin compromiso?`,
            timestamp: new Date().toISOString(),
            sent_by: 'template',
          });
          await supabase
            .from('conversations')
            .update({ followup_stage: 2, updated_at: new Date().toISOString() })
            .eq('id', conv.id);
          results.push(`✅ 24h template (stage 2) sent to ${conv.lead_phone} (${leadName})`);
        } else {
          results.push(`❌ 24h template failed for ${conv.lead_phone}: ${result.error}`);
        }
        continue;
      }

      // ── Stage 3: 48h template ──
      if (currentStage <= 2 && daysSinceLastMsg >= 2 && daysSinceLastMsg < 5) {
        await rateLimitDelay();
        const result = await sendTemplateMessage(
          conv.lead_phone,
          'seguimiento_sin_agendar',
          'es_MX',
          [{
            type: 'body',
            parameters: [
              { type: 'text', text: leadName },
              { type: 'text', text: projectType },
            ],
          }]
        );

        if (result.ok) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            role: 'assistant',
            content: `[📋 Seguimiento automático 48h] Hola ${leadName}, en Bolt notamos que mostró interés en su proyecto de ${projectType}. ¿Le gustaría agendar una breve llamada?`,
            timestamp: new Date().toISOString(),
            sent_by: 'template',
          });
          await supabase
            .from('conversations')
            .update({ followup_stage: 3, updated_at: new Date().toISOString() })
            .eq('id', conv.id);
          results.push(`✅ 48h template (stage 3) sent to ${conv.lead_phone} (${leadName})`);
        } else {
          results.push(`❌ 48h template failed for ${conv.lead_phone}: ${result.error}`);
        }
        continue;
      }

      // ── Stage 4: 5-day template ──
      if (currentStage <= 3 && daysSinceLastMsg >= 5 && daysSinceLastMsg < 10) {
        await rateLimitDelay();
        const result = await sendTemplateMessage(
          conv.lead_phone,
          'solicitud_detalles_proyecto',
          'es_MX',
          [{
            type: 'body',
            parameters: [{ type: 'text', text: leadName }],
          }]
        );

        if (result.ok) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            role: 'assistant',
            content: `[📋 Seguimiento automático 5d] Hola ${leadName}, en Bolt estamos preparando opciones para su proyecto. ¿Podría compartirnos un poco más de detalle?`,
            timestamp: new Date().toISOString(),
            sent_by: 'template',
          });
          await supabase
            .from('conversations')
            .update({ followup_stage: 4, updated_at: new Date().toISOString() })
            .eq('id', conv.id);
          results.push(`✅ 5-day template (stage 4) sent to ${conv.lead_phone} (${leadName})`);
        } else {
          results.push(`❌ 5-day template failed for ${conv.lead_phone}: ${result.error}`);
        }
        continue;
      }

      // ── Stage 5: ~10 day (1.5 week) re-engagement — final attempt ──
      if (currentStage <= 4 && daysSinceLastMsg >= 10) {
        await rateLimitDelay();
        const result = await sendTemplateMessage(
          conv.lead_phone,
          'reenganche_una_semana',
          'es_MX',
          [{
            type: 'body',
            parameters: [{ type: 'text', text: leadName }],
          }]
        );

        if (result.ok) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            role: 'assistant',
            content: `[📋 Re-enganche automático ~10d] Hola ${leadName}, le escribe el equipo de Bolt. Hace más de una semana platicamos sobre su proyecto. ¿Aún lo tiene en mente?`,
            timestamp: new Date().toISOString(),
            sent_by: 'template',
          });
          await supabase
            .from('conversations')
            .update({
              followup_stage: 5,
              updated_at: new Date().toISOString(),
              // After the final follow-up, close the conversation
              status: 'closed',
            })
            .eq('id', conv.id);
          results.push(`✅ 10-day re-engagement (stage 5) sent to ${conv.lead_phone} (${leadName}) — conversation closed`);
        } else {
          results.push(`❌ 10-day re-engagement failed for ${conv.lead_phone}: ${result.error}`);
        }
        continue;
      }
    }

    // ════════════════════════════════════════════════════
    // PART 3: Follow-up for auto-paused (deferred) conversations
    // ════════════════════════════════════════════════════
    // When a customer says "I'll respond later" and AI is auto-paused,
    // the regular follow-up system won't trigger (it requires ai_paused=false).
    // This special handler sends ONE gentle follow-up after 4+ hours,
    // then unpauses the AI so the regular follow-up sequence can take over.
    const { data: deferredConversations } = await supabase
      .from('conversations')
      .select('id, lead_phone, lead_name, last_customer_message_at, auto_pause_reason, followup_stage, message_count')
      .eq('status', 'active')
      .eq('ai_paused', true)
      .not('auto_pause_reason', 'is', null)
      .not('last_customer_message_at', 'is', null);

    for (const conv of deferredConversations || []) {
      if (!conv.last_customer_message_at || !conv.lead_phone) continue;

      // Only handle deferral auto-pauses (not schedule auto-pauses)
      const reason = (conv.auto_pause_reason || '').toLowerCase();
      const isDeferral = reason.includes('respond') || reason.includes('later') ||
        reason.includes('después') || reason.includes('despues') || reason.includes('responder');
      if (!isDeferral) continue;

      const lastCustomerMsg = new Date(conv.last_customer_message_at);
      const hoursSinceLastMsg = (now.getTime() - lastCustomerMsg.getTime()) / (1000 * 60 * 60);
      const leadName = conv.lead_name || 'estimado cliente';

      // Send a gentle follow-up after 4+ hours (giving the customer time to come back)
      if (hoursSinceLastMsg >= 4 && hoursSinceLastMsg <= 20 && (conv.followup_stage || 0) === 0) {
        try {
          await rateLimitDelay();
          const followupText = `Hola ${leadName}, esperamos que todo bien. Cuando tenga un momento, aquí estamos para platicar sobre su proyecto. Sin prisa. ⚡`;
          await sendTextMessage(conv.lead_phone, followupText);
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            role: 'assistant',
            content: followupText,
            timestamp: new Date().toISOString(),
            sent_by: 'cron',
          });
          // Unpause AI and set stage 1 so regular follow-up sequence continues
          await supabase
            .from('conversations')
            .update({
              ai_paused: false,
              auto_pause_reason: null,
              followup_stage: 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conv.id);
          results.push(`✅ Deferred follow-up sent to ${conv.lead_phone} (${leadName}) — AI unpaused`);
        } catch (err: any) {
          results.push(`❌ Deferred follow-up failed for ${conv.lead_phone}: ${err.message}`);
        }
      }
    }

    // ── Collect failures and notify the team ──
    const failures = results
      .filter(r => r.startsWith('❌'))
      .map(r => {
        // Parse "❌ 24h template failed for 5217775397580: error text"
        const match = r.match(/❌\s+(.+?)\s+failed\s+for\s+(\S+?)(?:\s+\((.+?)\))?:\s+(.*)/);
        return {
          phone: match?.[2] || 'unknown',
          name: match?.[3] || match?.[2] || 'unknown',
          stage: match?.[1] || 'unknown',
          error: match?.[4] || r,
        };
      });

    if (failures.length > 0) {
      // Notify via email and push in parallel
      await Promise.allSettled([
        notifyFollowupFailure({ failures }),
        pushFollowupFailure({ count: failures.length }),
      ]);
    }

    return res.status(200).json({
      message: `Processed ${(scheduledLeads || []).length} scheduled leads, ${(activeConversations || []).length} active conversations`,
      sent: results,
      failures: failures.length,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[Cron] send-reminders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ════════════════════════════════════════════════════
// Helper: Generate a smart follow-up message
// ════════════════════════════════════════════════════

/**
 * Generate a context-aware follow-up message for Stage 1.
 * This is sent within the 24h window so it can be a regular text message.
 * Uses conversation context (project type, last topic) for personalization.
 * Rotates between templates for variety.
 */
function generateSmartFollowup(leadName: string, projectType: string, conversationId: string): string {
  // Use conversation ID + name for consistent but varied selection per lead
  const seed = (leadName + conversationId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

  // Context-aware templates based on whether we know their project type
  const hasProject = projectType && projectType !== 'proyecto digital';

  const templatesWithProject = [
    `Hola ${leadName}, ¿tuvo oportunidad de pensar en su proyecto de ${projectType}? Tenemos disponibilidad para arrancar pronto y nos encantaría platicarle nuestras ideas. Estamos a sus órdenes. ⚡`,
    `Hola ${leadName}, solo quería dar seguimiento sobre su ${projectType}. Hemos trabajado proyectos similares y podemos compartirle ejemplos. ¿Le gustaría que le envíe más información? 😊`,
    `Hola ${leadName}, del equipo de Bolt. Quedamos pendientes de platicar sobre su ${projectType}. En una llamada rápida de 20 minutos podemos darle una propuesta personalizada, sin compromiso. ¿Qué día le funciona? ⚡`,
  ];

  const templatesGeneric = [
    `Hola ${leadName}, del equipo de Bolt. ¿Tuvo oportunidad de pensar en su proyecto? Estamos a sus órdenes si tiene alguna duda o quiere platicar más. ⚡`,
    `Hola ${leadName}, solo quería dar seguimiento. Si tiene preguntas sobre cómo podemos ayudarle, con gusto le atendemos. Puede ver nuestro portafolio en boltdevlabs.com/portfolio 😊`,
    `Hola ${leadName}, del equipo de Bolt. Nos encantaría platicar sobre su proyecto en una llamada rápida de 20 min. ¿Hay algún día y hora que le funcione? ⚡`,
  ];

  const templates = hasProject ? templatesWithProject : templatesGeneric;
  return templates[seed % templates.length];
}

// ════════════════════════════════════════════════════
// Helper: Check if a reminder was already sent
// ════════════════════════════════════════════════════

async function checkReminderSent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  conversationId: string,
  reminderType: string
): Promise<boolean> {
  const { data } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .like('content', `%${reminderType}%`)
    .limit(1);

  return (data && data.length > 0) || false;
}

// ════════════════════════════════════════════════════
// Helper: Parse meeting datetime string
// ════════════════════════════════════════════════════

function parseMeetingTime(datetimeStr: string): Date | null {
  // Try ISO format first
  const isoDate = new Date(datetimeStr);
  if (!isNaN(isoDate.getTime()) && datetimeStr.includes('-')) {
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
    if (months[monthName] !== undefined) {
      day = parseInt(dateMatch[1]);
      month = months[monthName];
    }
    // If monthName is not a valid month (e.g., "de la tarde"), don't set day
  }

  let hours: number | null = null;
  let minutes = 0;

  const time12Match = datetimeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)/i);
  if (time12Match) {
    hours = parseInt(time12Match[1]);
    minutes = time12Match[2] ? parseInt(time12Match[2]) : 0;
    const isPM = time12Match[3].toLowerCase() === 'pm';
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  } else {
    const time24Match = datetimeStr.match(/(\d{1,2}):(\d{2})/);
    if (time24Match) {
      hours = parseInt(time24Match[1]);
      minutes = parseInt(time24Match[2]);
    } else {
      const simpleTimeMatch = datetimeStr.match(/las?\s+(\d{1,2})/i);
      if (simpleTimeMatch) {
        hours = parseInt(simpleTimeMatch[1]);
        if (hours < 8) hours += 12;
      }
    }
  }

  if (day !== null && month !== null && hours !== null) {
    const meetingDate = new Date(currentYear, month, day, hours, minutes, 0);
    if (meetingDate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
      meetingDate.setFullYear(currentYear + 1);
    }
    return meetingDate;
  }

  if (hours !== null && day === null) {
    const meetingDate = new Date(now);
    meetingDate.setHours(hours, minutes, 0, 0);
    if (meetingDate.getTime() < now.getTime()) {
      meetingDate.setDate(meetingDate.getDate() + 1);
    }
    return meetingDate;
  }

  return null;
}
