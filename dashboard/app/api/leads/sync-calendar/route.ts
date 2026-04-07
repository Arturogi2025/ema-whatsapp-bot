import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent, isGoogleConnected } from '@/lib/google-calendar';

export async function POST(req: NextRequest) {
  try {
    const { leadId } = await req.json();

    if (!leadId) {
      return NextResponse.json({ error: 'leadId requerido' }, { status: 400 });
    }

    // Check if Google is connected
    const { connected } = await isGoogleConnected();
    if (!connected) {
      return NextResponse.json({ ok: true, skipped: 'google_not_connected' });
    }

    const supabase = getSupabaseAdmin();
    const { data: lead } = await supabase
      .from('leads_bolt')
      .select('id, name, phone, project_type, notes, preferred_datetime, google_event_id')
      .eq('id', leadId)
      .single();

    if (!lead || !lead.preferred_datetime) {
      return NextResponse.json({ error: 'Lead no encontrado o sin fecha' }, { status: 404 });
    }

    // Skip if already synced
    if (lead.google_event_id) {
      return NextResponse.json({ ok: true, skipped: 'already_synced', eventId: lead.google_event_id });
    }

    const eventId = await createCalendarEvent({
      name: lead.name,
      phone: lead.phone,
      project_type: lead.project_type,
      notes: lead.notes,
      preferred_datetime: lead.preferred_datetime,
    });

    if (eventId) {
      await supabase
        .from('leads_bolt')
        .update({ google_event_id: eventId })
        .eq('id', leadId);
    }

    return NextResponse.json({ ok: true, eventId });
  } catch (error) {
    console.error('[Sync Calendar] Error:', error);
    return NextResponse.json({ error: 'Error sincronizando calendario' }, { status: 500 });
  }
}
