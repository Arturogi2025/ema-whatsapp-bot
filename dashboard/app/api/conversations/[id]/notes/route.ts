import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: Fetch notes for a conversation
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseAdmin();
  const { data: notes } = await supabase
    .from('conversation_notes')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ notes: notes || [] });
}

// POST: Create a new note
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { content } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: note, error } = await supabase
    .from('conversation_notes')
    .insert({
      conversation_id: params.id,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note });
}

// DELETE: Remove a note
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const noteId = req.nextUrl.searchParams.get('noteId');
  if (!noteId) {
    return NextResponse.json({ error: 'noteId required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from('conversation_notes')
    .delete()
    .eq('id', noteId)
    .eq('conversation_id', params.id);

  return NextResponse.json({ deleted: true });
}
