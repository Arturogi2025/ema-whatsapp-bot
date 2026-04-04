import { getSupabaseAdmin } from './supabase';

// ============================================================
// Types
// ============================================================
export interface Conversation {
  id: string;
  lead_phone: string;
  lead_name: string | null;
  status: string;          // 'active' | 'scheduled' | 'closed'
  ai_paused: boolean;      // true = manual mode, AI doesn't auto-respond
  source: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LeadBolt {
  id: string;
  conversation_id: string;
  name: string | null;
  phone: string;
  project_type: string | null;
  objective: string | null;
  preferred_datetime: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Conversation CRUD
// ============================================================

/**
 * Find existing conversation by phone, or create a new one.
 */
export async function getOrCreateConversation(
  phone: string,
  name?: string
): Promise<Conversation> {
  const supabase = getSupabaseAdmin();

  // Try to find existing
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('lead_phone', phone)
    .single();

  if (existing) {
    // Update name if we didn't have it before
    if (name && !existing.lead_name) {
      await supabase
        .from('conversations')
        .update({ lead_name: name })
        .eq('id', existing.id);
      existing.lead_name = name;
    }
    return existing as Conversation;
  }

  // Create new conversation
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      lead_phone: phone,
      lead_name: name || null,
      status: 'active',
      source: 'whatsapp',
    })
    .select()
    .single();

  if (error) {
    // Handle race condition — another request might have created it
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_phone', phone)
        .single();
      if (retry) return retry as Conversation;
    }
    throw error;
  }

  return created as Conversation;
}

/**
 * Get conversation history (last N messages) for AI context.
 */
export async function getConversationHistory(
  conversationId: string,
  limit = 20
): Promise<Message[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[Conversation] Failed to get history:', error);
    return [];
  }

  return (data || []) as Message[];
}

/**
 * Save a message to the conversation.
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role,
    content,
  });

  if (error) {
    console.error('[Conversation] Failed to save message:', error);
    throw error;
  }
}

/**
 * Get lead data by conversation ID.
 * Used to retrieve scheduled datetime for already-scheduled conversations.
 */
export async function getLeadByConversation(
  conversationId: string
): Promise<LeadBolt | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('leads_bolt')
    .select('*')
    .eq('conversation_id', conversationId)
    .single();

  if (error) {
    // PGRST116 = not found, which is normal for new conversations
    if (error.code !== 'PGRST116') {
      console.error('[Conversation] Failed to get lead:', error);
    }
    return null;
  }

  return data as LeadBolt;
}

/**
 * Create or update a lead in leads_bolt.
 */
export async function upsertLead(data: {
  conversationId: string;
  name?: string;
  phone: string;
  projectType?: string;
  objective?: string;
  preferredDatetime?: string;
  status?: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Check if lead exists for this conversation
  const { data: existing } = await supabase
    .from('leads_bolt')
    .select('id')
    .eq('conversation_id', data.conversationId)
    .single();

  if (existing) {
    const updates: Record<string, any> = {};
    if (data.name) updates.name = data.name;
    if (data.projectType) updates.project_type = data.projectType;
    if (data.objective) updates.objective = data.objective;
    if (data.preferredDatetime) updates.preferred_datetime = data.preferredDatetime;
    if (data.status) updates.status = data.status;

    await supabase
      .from('leads_bolt')
      .update(updates)
      .eq('id', existing.id);
  } else {
    await supabase.from('leads_bolt').insert({
      conversation_id: data.conversationId,
      name: data.name || null,
      phone: data.phone,
      project_type: data.projectType || null,
      objective: data.objective || null,
      preferred_datetime: data.preferredDatetime || null,
      status: data.status || 'new',
    });
  }
}

/**
 * Mark conversation as scheduled and update lead.
 */
export async function markAsScheduled(
  conversationId: string,
  datetime: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await Promise.all([
    supabase
      .from('conversations')
      .update({ status: 'scheduled' })
      .eq('id', conversationId),
    supabase
      .from('leads_bolt')
      .update({ status: 'scheduled', preferred_datetime: datetime })
      .eq('conversation_id', conversationId),
  ]);
}
