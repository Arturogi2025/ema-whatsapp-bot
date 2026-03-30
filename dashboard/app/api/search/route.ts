import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = getSupabaseAdmin();

  // Search by name, phone, or message content
  const searchPattern = `%${q}%`;

  // Search conversations by name/phone
  const { data: convMatches } = await supabase
    .from('conversations')
    .select('id, lead_name, lead_phone, status')
    .or(`lead_name.ilike.${searchPattern},lead_phone.ilike.${searchPattern}`)
    .order('updated_at', { ascending: false })
    .limit(10);

  // Search messages by content
  const { data: msgMatches } = await supabase
    .from('messages')
    .select('conversation_id, content')
    .ilike('content', searchPattern)
    .order('timestamp', { ascending: false })
    .limit(20);

  // Merge results, prioritizing conversation matches
  const resultMap = new Map<string, any>();

  for (const conv of convMatches || []) {
    resultMap.set(conv.id, {
      id: conv.id,
      lead_name: conv.lead_name,
      lead_phone: conv.lead_phone,
      status: conv.status,
    });
  }

  // Add message matches — need to fetch conversation details
  const msgConvIds = [...new Set((msgMatches || []).map(m => m.conversation_id))].filter(id => !resultMap.has(id));

  if (msgConvIds.length > 0) {
    const { data: msgConvs } = await supabase
      .from('conversations')
      .select('id, lead_name, lead_phone, status')
      .in('id', msgConvIds);

    for (const conv of msgConvs || []) {
      const msg = msgMatches?.find(m => m.conversation_id === conv.id);
      resultMap.set(conv.id, {
        id: conv.id,
        lead_name: conv.lead_name,
        lead_phone: conv.lead_phone,
        status: conv.status,
        last_message: msg?.content,
      });
    }
  }

  return NextResponse.json({ results: [...resultMap.values()].slice(0, 15) });
}
