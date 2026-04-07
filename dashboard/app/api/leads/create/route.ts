import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent, isGoogleConnected } from '@/lib/google-calendar';

function normalizePhone(raw: string): string {
  // Strip spaces, dashes, parentheses
  let phone = raw.replace(/[\s\-()]/g, '');
  // Ensure + prefix
  if (!phone.startsWith('+')) {
    // If starts with country code without +, add it
    if (phone.startsWith('52') && phone.length >= 12) {
      phone = '+' + phone;
    } else {
      // Assume Mexican number
      phone = '+52' + phone;
    }
  }
  return phone;
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, preferred_datetime, project_type, notes } = await req.json();

    if (!name?.trim() || !phone?.trim() || !preferred_datetime?.trim()) {
      return NextResponse.json(
        { error: 'Nombre, teléfono y fecha/hora son requeridos' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone.trim());
    const supabase = getSupabaseAdmin();

    // Create conversation with source: 'manual'
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        lead_phone: normalizedPhone,
        lead_name: name.trim(),
        status: 'scheduled',
        source: 'manual',
        message_count: 0,
        ai_paused: true,
      })
      .select('id')
      .single();

    if (convError) {
      console.error('[Create lead] Conversation error:', convError);
      return NextResponse.json({ error: 'Error creando conversación' }, { status: 500 });
    }

    // Create lead linked to conversation
    const { data: lead, error: leadError } = await supabase
      .from('leads_bolt')
      .insert({
        conversation_id: conversation.id,
        name: name.trim(),
        phone: normalizedPhone,
        preferred_datetime: preferred_datetime.trim(),
        project_type: project_type?.trim() || null,
        notes: notes?.trim() || null,
        status: 'scheduled',
      })
      .select('id')
      .single();

    if (leadError) {
      console.error('[Create lead] Lead error:', leadError);
      return NextResponse.json({ error: 'Error creando lead' }, { status: 500 });
    }

    // Google Calendar sync (non-blocking — don't fail the request if calendar fails)
    let googleEventId: string | null = null;
    try {
      const { connected } = await isGoogleConnected();
      if (connected) {
        googleEventId = await createCalendarEvent({
          name: name.trim(),
          phone: normalizedPhone,
          project_type: project_type?.trim() || null,
          notes: notes?.trim() || null,
          preferred_datetime: preferred_datetime.trim(),
        });

        if (googleEventId) {
          await supabase
            .from('leads_bolt')
            .update({ google_event_id: googleEventId })
            .eq('id', lead.id);
        }
      }
    } catch (calError) {
      console.error('[Create lead] Calendar sync error (non-fatal):', calError);
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      conversationId: conversation.id,
      googleEventId,
    });
  } catch (error) {
    console.error('[Create lead] Error:', error);
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}
