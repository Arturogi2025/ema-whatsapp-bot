import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const leadId = params.id;
    if (!leadId) {
      return NextResponse.json({ error: 'leadId requerido' }, { status: 400 });
    }

    const body = await req.json();
    const { status, notes } = body as { status?: string; notes?: string };

    if (!status && notes === undefined) {
      return NextResponse.json({ error: 'Se requiere status o notes' }, { status: 400 });
    }

    const VALID_STATUSES = ['new', 'contacted', 'scheduled', 'converted', 'lost'];
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Build update payload
    const updatePayload: Record<string, string> = {};
    if (status) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;

    const { error: updateError } = await supabase
      .from('leads_bolt')
      .update(updatePayload)
      .eq('id', leadId);

    if (updateError) {
      console.error('[PostCall] Error updating lead:', updateError);
      return NextResponse.json({ error: 'Error actualizando lead' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, leadId, updated: updatePayload });
  } catch (error) {
    console.error('[PostCall] Error:', error);
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}
