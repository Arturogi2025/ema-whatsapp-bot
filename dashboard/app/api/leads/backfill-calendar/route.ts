import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent, isGoogleConnected } from '@/lib/google-calendar';

export async function POST() {
  try {
    const { connected } = await isGoogleConnected();
    if (!connected) {
      return NextResponse.json({ error: 'Google Calendar no conectado' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: leads } = await supabase
      .from('leads_bolt')
      .select('id, name, phone, project_type, notes, preferred_datetime')
      .eq('status', 'scheduled')
      .not('preferred_datetime', 'is', null)
      .is('google_event_id', null)
      .limit(50);

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: 'No hay leads pendientes de sincronizar' });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
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
            .eq('id', lead.id);
          synced++;
        }
      } catch (err) {
        errors.push(`${lead.name || lead.phone}: ${err}`);
      }
    }

    return NextResponse.json({ ok: true, synced, total: leads.length, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('[Backfill Calendar] Error:', error);
    return NextResponse.json({ error: 'Error en backfill' }, { status: 500 });
  }
}
