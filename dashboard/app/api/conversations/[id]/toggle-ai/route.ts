import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { ai_paused } = await req.json();
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('conversations')
      .update({
        ai_paused: ai_paused,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (error) {
      console.error('[Toggle AI] Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ai_paused });
  } catch (error) {
    console.error('[Toggle AI] Error:', error);
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}
