import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Get conversation to find the phone
    const { data: conversation } = await supabase
      .from('conversations')
      .select('lead_phone')
      .eq('id', params.id)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }

    // Save message to DB
    await supabase.from('messages').insert({
      conversation_id: params.id,
      role: 'assistant',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    });

    // Update conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.id);

    // Send via WhatsApp
    const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!waToken || !waPhoneId) {
      return NextResponse.json({ error: 'WhatsApp no configurado' }, { status: 500 });
    }

    const waRes = await fetch(
      `https://graph.facebook.com/v20.0/${waPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: conversation.lead_phone,
          type: 'text',
          text: { body: text.trim() },
        }),
      }
    );

    if (!waRes.ok) {
      const err = await waRes.json();
      console.error('[Manual send] WhatsApp error:', err);
      return NextResponse.json({ error: 'Error enviando a WhatsApp', details: err }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Manual send] Error:', error);
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}
