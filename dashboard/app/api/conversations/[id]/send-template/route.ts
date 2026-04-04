import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { templateName, languageCode = 'es_MX', variables = {} } = body;

    if (!templateName) {
      return NextResponse.json({ error: 'Template name requerido' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Get conversation to find the phone
    const { data: conversation } = await supabase
      .from('conversations')
      .select('lead_phone, lead_name')
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

    // Build template components from variables
    const variableKeys = Object.keys(variables).sort();
    let components: any[] | undefined;

    if (variableKeys.length > 0) {
      const parameters = variableKeys.map(key => ({
        type: 'text',
        text: variables[key],
      }));
      components = [{ type: 'body', parameters }];
    }

    // Build template payload
    const templatePayload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conversation.lead_phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components) {
      templatePayload.template.components = components;
    }

    // Send via WhatsApp
    const waRes = await fetch(
      `https://graph.facebook.com/v21.0/${waPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatePayload),
      }
    );

    if (!waRes.ok) {
      const err = await waRes.json();
      console.error('[Template send] WhatsApp error:', err);
      return NextResponse.json(
        { error: 'Error enviando template a WhatsApp', details: err },
        { status: 500 }
      );
    }

    // Build a preview of the message for storage
    const previewBody = body.previewText || `[📋 Plantilla: ${templateName}]`;

    // Save template message to DB as assistant message
    await supabase.from('messages').insert({
      conversation_id: params.id,
      role: 'assistant',
      content: previewBody,
      timestamp: new Date().toISOString(),
    });

    // Update conversation updated_at and reopen if closed
    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        // Reopen conversation when sending a template (re-engages the lead)
        status: 'active',
      })
      .eq('id', params.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Template send] Error:', error);
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 });
  }
}
