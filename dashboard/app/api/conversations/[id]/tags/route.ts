import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: Fetch tags for a conversation
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseAdmin();
  const { data: tags } = await supabase
    .from('conversation_tags')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ tags: tags || [] });
}

// POST: Add a tag
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { tag, color } = await req.json();
  if (!tag?.trim()) {
    return NextResponse.json({ error: 'Tag required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('conversation_tags')
    .insert({
      conversation_id: params.id,
      tag: tag.trim(),
      color: color || '#60a5fa',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag: data });
}

// DELETE: Remove a tag
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tagId = req.nextUrl.searchParams.get('tagId');
  if (!tagId) {
    return NextResponse.json({ error: 'tagId required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from('conversation_tags')
    .delete()
    .eq('id', tagId)
    .eq('conversation_id', params.id);

  return NextResponse.json({ deleted: true });
}
