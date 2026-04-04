import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../../lib/supabase';
import { sendTemplateMessage } from '../../lib/whatsapp';

/**
 * Cron job: Send automatic meeting reminders
 *
 * This endpoint is called by Vercel Cron every 30 minutes.
 * It checks for upcoming scheduled meetings and sends reminders:
 * - 24 hours before: recordatorio_reunion_24h template
 * - 2 hours before: recordatorio_reunion_2h template
 *
 * To set up in vercel.json:
 * { "crons": [{ "path": "/api/cron/send-reminders", "schedule": "*/30 * * * *" }] }
 *
 * Security: Uses CRON_SECRET to verify the request is from Vercel Cron
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (Vercel sends this header for cron jobs)
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

    // Get all scheduled leads with preferred_datetime
    const { data: scheduledLeads } = await supabase
      .from('leads_bolt')
      .select('id, name, phone, preferred_datetime, conversation_id, status')
      .eq('status', 'scheduled')
      .not('preferred_datetime', 'is', null);

    if (!scheduledLeads || scheduledLeads.length === 0) {
      return res.status(200).json({ message: 'No scheduled meetings found', sent: [] });
    }

    // Check for reminders_sent in a tracking table or use a simple approach:
    // We'll check if a reminder message was already sent by querying messages
    for (const lead of scheduledLeads) {
      if (!lead.preferred_datetime || !lead.phone) continue;

      // Parse the preferred_datetime — could be in various formats
      // Try to extract a date/time from the text
      const meetingTime = parseMeetingTime(lead.preferred_datetime);
      if (!meetingTime) {
        results.push(`⚠️ Could not parse datetime for lead ${lead.id}: "${lead.preferred_datetime}"`);
        continue;
      }

      const hoursUntilMeeting = (meetingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const leadName = lead.name || 'estimado cliente';

      // Extract just the time part for the template
      const timeStr = meetingTime.toLocaleTimeString('es-MX', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Mexico_City',
      });

      // 24-hour reminder: send between 23-25 hours before
      if (hoursUntilMeeting >= 23 && hoursUntilMeeting <= 25) {
        const alreadySent = await checkReminderSent(supabase, lead.conversation_id, 'recordatorio_reunion_24h');
        if (!alreadySent) {
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
            // Save the reminder as a message in the conversation
            await supabase.from('messages').insert({
              conversation_id: lead.conversation_id,
              role: 'assistant',
              content: `[📋 Recordatorio automático 24h] Hola ${leadName}, le recordamos que mañana tiene una reunión agendada con Bolt a las ${timeStr}.`,
              timestamp: new Date().toISOString(),
            });
            results.push(`✅ 24h reminder sent to ${lead.phone} (${leadName})`);
          } else {
            results.push(`❌ 24h reminder failed for ${lead.phone}: ${result.error}`);
          }
        } else {
          results.push(`⏭️ 24h reminder already sent for ${lead.phone}`);
        }
      }

      // 2-hour reminder: send between 1.5-2.5 hours before
      if (hoursUntilMeeting >= 1.5 && hoursUntilMeeting <= 2.5) {
        const alreadySent = await checkReminderSent(supabase, lead.conversation_id, 'recordatorio_reunion_2h');
        if (!alreadySent) {
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
            });
            results.push(`✅ 2h reminder sent to ${lead.phone} (${leadName})`);
          } else {
            results.push(`❌ 2h reminder failed for ${lead.phone}: ${result.error}`);
          }
        } else {
          results.push(`⏭️ 2h reminder already sent for ${lead.phone}`);
        }
      }
    }

    return res.status(200).json({
      message: `Processed ${scheduledLeads.length} scheduled leads`,
      sent: results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[Cron] send-reminders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Check if a specific reminder type was already sent for this conversation
 */
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

/**
 * Parse a meeting datetime string into a Date object.
 * Handles common formats from the AI:
 * - "jueves 10 de abril a las 3:00 PM"
 * - "10 de abril, 15:00"
 * - "2025-04-10T15:00:00"
 * - "mañana a las 3pm" (relative — uses current date as reference)
 */
function parseMeetingTime(datetimeStr: string): Date | null {
  // Try ISO format first
  const isoDate = new Date(datetimeStr);
  if (!isNaN(isoDate.getTime()) && datetimeStr.includes('-')) {
    return isoDate;
  }

  // Try to extract date and time from Spanish natural language
  const now = new Date();
  const currentYear = now.getFullYear();

  // Month mapping
  const months: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };

  // Extract month and day: "10 de abril", "abril 10"
  let day: number | null = null;
  let month: number | null = null;

  const dateMatch = datetimeStr.match(/(\d{1,2})\s+de\s+(\w+)/i);
  if (dateMatch) {
    day = parseInt(dateMatch[1]);
    const monthName = dateMatch[2].toLowerCase();
    if (months[monthName] !== undefined) {
      month = months[monthName];
    }
  }

  // Extract time: "3:00 PM", "15:00", "3pm", "las 3"
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
      // "las 3" without AM/PM — assume PM for business hours
      const simpleTimeMatch = datetimeStr.match(/las?\s+(\d{1,2})/i);
      if (simpleTimeMatch) {
        hours = parseInt(simpleTimeMatch[1]);
        if (hours < 8) hours += 12; // Assume PM for small numbers
      }
    }
  }

  if (day !== null && month !== null && hours !== null) {
    const meetingDate = new Date(currentYear, month, day, hours, minutes, 0);
    // If the date is in the past, try next year
    if (meetingDate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
      meetingDate.setFullYear(currentYear + 1);
    }
    return meetingDate;
  }

  // If we only have time but no date, assume today/tomorrow
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
