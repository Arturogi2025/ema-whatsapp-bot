import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent, deleteCalendarEvent, isGoogleConnected } from '@/lib/google-calendar';

export async function PATCH(req: NextRequest) {
  try {
    const { leadId, newDatetime } = await req.json();

    if (!leadId || !newDatetime) {
      return NextResponse.json(
        { error: 'leadId y newDatetime son requeridos' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch the current lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads_bolt')
      .select('id, name, phone, project_type, notes, preferred_datetime, google_event_id')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    // Delete old Google Calendar event if it exists
    if (lead.google_event_id) {
      try {
        const { connected } = await isGoogleConnected();
        if (connected) {
          await deleteCalendarEvent(lead.google_event_id);
        }
      } catch {
        // Non-fatal — the old event may have been manually deleted
        console.warn('[Reschedule] Could not delete old calendar event:', lead.google_event_id);
      }
    }

    // Update preferred_datetime in DB and clear the old event ID
    const { error: updateError } = await supabase
      .from('leads_bolt')
      .update({
        preferred_datetime: newDatetime,
        google_event_id: null,
      })
      .eq('id', leadId);

    if (updateError) {
      return NextResponse.json({ error: 'Error actualizando lead' }, { status: 500 });
    }

    // Create new Google Calendar event with the updated datetime
    let newEventId: string | null = null;
    try {
      const { connected } = await isGoogleConnected();
      if (connected) {
        newEventId = await createCalendarEvent({
          name: lead.name,
          phone: lead.phone,
          project_type: lead.project_type,
          notes: lead.notes,
          preferred_datetime: newDatetime,
        });

        if (newEventId) {
          await supabase
            .from('leads_bolt')
            .update({ google_event_id: newEventId })
            .eq('id', leadId);
        }
      }
    } catch (calError) {
      console.error('[Reschedule] Calendar sync error (non-fatal):', calError);
    }

    return NextResponse.json({
      ok: true,
      leadId,
      newDatetime,
      googleEventId: newEventId,
    });
  } catch (error) {
    console.error('[Reschedule] Error:', error);
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}
