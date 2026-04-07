import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent, deleteCalendarEvent, isGoogleConnected } from '@/lib/google-calendar';

/**
 * POST /api/leads/reschedule
 * Updates a lead's preferred_datetime, deletes the old calendar event,
 * and creates a new one with the correct time.
 */
export async function POST(req: NextRequest) {
  try {
    const { leadId, preferred_datetime } = await req.json();

    if (!leadId || !preferred_datetime) {
      return NextResponse.json({ error: 'leadId y preferred_datetime son requeridos' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Fetch the lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads_bolt')
      .select('id, name, phone, project_type, notes, google_event_id')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    // Delete old calendar event if it exists
    const { connected } = await isGoogleConnected();
    if (connected && lead.google_event_id) {
      await deleteCalendarEvent(lead.google_event_id);
    }

    // Update lead with new datetime, clear old event id
    await supabase
      .from('leads_bolt')
      .update({
        preferred_datetime,
        google_event_id: null,
        status: 'scheduled',
      })
      .eq('id', leadId);

    // Also update the conversation status
    const { data: conv } = await supabase
      .from('leads_bolt')
      .select('conversation_id')
      .eq('id', leadId)
      .single();

    if (conv?.conversation_id) {
      await supabase
        .from('conversations')
        .update({ status: 'scheduled' })
        .eq('id', conv.conversation_id);
    }

    // Create new calendar event
    let newEventId: string | null = null;
    if (connected) {
      newEventId = await createCalendarEvent({
        name: lead.name,
        phone: lead.phone,
        project_type: lead.project_type,
        notes: lead.notes,
        preferred_datetime,
      });

      if (newEventId) {
        await supabase
          .from('leads_bolt')
          .update({ google_event_id: newEventId })
          .eq('id', leadId);
      }
    }

    return NextResponse.json({ ok: true, newEventId });
  } catch (error) {
    console.error('[Reschedule] Error:', error);
    return NextResponse.json({ error: 'Error reagendando' }, { status: 500 });
  }
}
