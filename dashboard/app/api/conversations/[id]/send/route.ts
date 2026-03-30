import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { text, mediaType, mediaUrl, caption } = body;

    // Validate: need text or media
    if (!text?.trim() && !mediaUrl) {
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

    const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!waToken || !waPhoneId) {
      return NextResponse.json({ error: 'WhatsApp no configurado' }, { status: 500 });
    }

    let messageContent: string;
    let waBody: any;

    if (mediaUrl && mediaType === 'image') {
      // Send image with optional caption
      messageContent = caption ? `[📷 Imagen] ${caption}` : '[📷 Imagen enviada]';
      waBody = {
        messaging_product: 'whatsapp',
        to: conversation.lead_phone,
        type: 'image',
        image: { link: mediaUrl, caption: caption || '' },
      };
    } else if (mediaUrl && mediaType === 'document') {
      // Send document
      const filename = mediaUrl.split('/').pop() || 'documento';
      messageContent = `[📄 Documento: ${filename}]`;
      waBody = {
        messaging_product: 'whatsapp',
        to: conversation.lead_phone,
        type: 'document',
        document: { link: mediaUrl, filename, caption: caption || '' },
      };
    } else {
      // Text message
      messageContent = text.trim();
      waBody = {
        messaging_product: 'whatsapp',
        to: conversation.lead_phone,
        type: 'text',
        text: { body: text.trim() },
      };
    }

    // Save message to DB
    await supabase.from('messages').insert({
      conversation_id: params.id,
      role: 'assistant',
      content: messageContent,
      timestamp: new Date().toISOString(),
    });

    // Update conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.id);

    // Send via WhatsApp
    const waRes = await fetch(
      `https://graph.facebook.com/v21.0/${waPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(waBody),
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
