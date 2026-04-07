import { getSupabaseAdmin } from './supabase';
import type { Conversation, Message, Lead, DashboardStats, DailyActivity } from './types';
import { subDays, format, startOfDay } from 'date-fns';

export async function getStats(): Promise<DashboardStats> {
  const supabase = getSupabaseAdmin();

  const weekAgo = subDays(new Date(), 7).toISOString();

  const [convResult, leadsResult, scheduledResult, newResult] = await Promise.all([
    supabase.from('conversations').select('status', { count: 'exact' }),
    supabase.from('leads_bolt').select('status', { count: 'exact' }),
    supabase.from('conversations').select('id', { count: 'exact' }).eq('status', 'scheduled'),
    supabase.from('conversations').select('id', { count: 'exact' }).gte('created_at', weekAgo),
  ]);

  const conversations = convResult.data || [];
  const leads = leadsResult.data || [];
  const totalConversations = convResult.count || 0;
  const totalLeads = leadsResult.count || 0;
  const scheduledCalls = scheduledResult.count || 0;
  const newThisWeek = newResult.count || 0;

  const activeConversations = conversations.filter(c => c.status === 'active').length;
  const convertedLeads = leads.filter(l => l.status === 'converted' || l.status === 'scheduled').length;
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  return {
    totalConversations,
    activeConversations,
    scheduledCalls,
    totalLeads,
    conversionRate,
    newThisWeek,
  };
}

export async function getDailyActivity(days = 14): Promise<DailyActivity[]> {
  const supabase = getSupabaseAdmin();
  const since = subDays(new Date(), days).toISOString();

  const [convData, msgData] = await Promise.all([
    supabase.from('conversations').select('created_at').gte('created_at', since),
    supabase.from('messages').select('timestamp').gte('timestamp', since).eq('role', 'user'),
  ]);

  // Build date buckets
  const result: Record<string, DailyActivity> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    result[d] = { date: d, conversations: 0, messages: 0 };
  }

  for (const c of convData.data || []) {
    const d = format(startOfDay(new Date(c.created_at)), 'yyyy-MM-dd');
    if (result[d]) result[d].conversations++;
  }
  for (const m of msgData.data || []) {
    const d = format(startOfDay(new Date(m.timestamp)), 'yyyy-MM-dd');
    if (result[d]) result[d].messages++;
  }

  return Object.values(result);
}

export async function getConversations(status?: string): Promise<Conversation[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data } = await query;
  return (data || []) as Conversation[];
}

/** Get conversations WITH last message preview */
export async function getConversationsWithPreview(status?: string): Promise<Conversation[]> {
  const conversations = await getConversations(status);
  if (conversations.length === 0) return conversations;

  const supabase = getSupabaseAdmin();
  const ids = conversations.map(c => c.id);

  // Fetch recent messages for all conversations (ordered newest first)
  const { data: recentMsgs } = await supabase
    .from('messages')
    .select('conversation_id, content, role, sent_by')
    .in('conversation_id', ids)
    .neq('role', 'system')
    .order('timestamp', { ascending: false })
    .limit(500);

  // Pick the most recent message per conversation
  const lastMsgMap = new Map<string, { content: string; role: string; sent_by: string | null }>();
  for (const msg of recentMsgs || []) {
    if (!lastMsgMap.has(msg.conversation_id)) {
      lastMsgMap.set(msg.conversation_id, {
        content: msg.content,
        role: msg.role,
        sent_by: msg.sent_by || null,
      });
    }
  }

  return conversations.map(c => ({
    ...c,
    last_message: lastMsgMap.get(c.id)?.content || null,
    last_message_role: lastMsgMap.get(c.id)?.role || null,
    last_message_sent_by: lastMsgMap.get(c.id)?.sent_by || null,
  }));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single();
  return data as Conversation | null;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, role, content, timestamp, sent_by')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true });
  if (error) {
    console.error('[getMessages] Supabase error:', error.message);
    return [];
  }
  return (data || []) as Message[];
}

export async function getLeadByConversation(conversationId: string): Promise<Lead | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('leads_bolt')
    .select('*')
    .eq('conversation_id', conversationId)
    .single();
  return data as Lead | null;
}

export async function getLeads(status?: string): Promise<Lead[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('leads_bolt')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data } = await query;
  return (data || []) as Lead[];
}

export async function getProjectTypeCounts() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('leads_bolt')
    .select('project_type')
    .not('project_type', 'is', null);

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const key = row.project_type || 'sin tipo';
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([project_type, count]) => ({ project_type, count }))
    .sort((a, b) => b.count - a.count);
}

/** Get city distribution from phone prefixes */
export async function getCityDistribution() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('conversations').select('lead_phone');
  if (!data) return [];

  // Dynamic import to avoid bundling all area codes in every query
  const { detectCity } = await import('./geo');
  const counts: Record<string, number> = {};
  for (const row of data) {
    const city = detectCity(row.lead_phone) || 'Otra';
    counts[city] = (counts[city] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count);
}

/** Get recent activity feed (new conversations, scheduled calls, new leads) */
export async function getRecentActivity(limit = 15) {
  const supabase = getSupabaseAdmin();
  const threeDaysAgo = subDays(new Date(), 3).toISOString();

  // Fetch recent conversations, leads, and scheduled events in parallel
  const [recentConvs, recentLeads, scheduledConvs] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, lead_phone, lead_name, status, created_at, updated_at, message_count')
      .gte('updated_at', threeDaysAgo)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('leads_bolt')
      .select('id, name, phone, project_type, preferred_datetime, status, created_at, conversation_id')
      .gte('created_at', threeDaysAgo)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('conversations')
      .select('id, lead_phone, lead_name, updated_at')
      .eq('status', 'scheduled')
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  type ActivityItem = {
    id: string;
    type: 'new_conversation' | 'new_lead' | 'scheduled' | 'message';
    title: string;
    subtitle: string;
    timestamp: string;
    conversationId?: string;
  };

  const items: ActivityItem[] = [];

  // New conversations
  for (const c of recentConvs.data || []) {
    items.push({
      id: `conv-${c.id}`,
      type: 'new_conversation',
      title: c.lead_name || c.lead_phone,
      subtitle: `Nueva conversación · ${c.message_count || 0} mensajes`,
      timestamp: c.created_at,
      conversationId: c.id,
    });
  }

  // New leads with project type
  for (const l of recentLeads.data || []) {
    const projectLabels: Record<string, string> = {
      web: 'Página web', ecommerce: 'Tienda online', landing: 'Landing page', custom: 'Sistema a medida',
    };
    items.push({
      id: `lead-${l.id}`,
      type: 'new_lead',
      title: l.name || l.phone,
      subtitle: `Nuevo lead · ${projectLabels[l.project_type || ''] || l.project_type || 'Sin tipo'}`,
      timestamp: l.created_at,
      conversationId: l.conversation_id,
    });
  }

  // Scheduled calls
  for (const s of scheduledConvs.data || []) {
    items.push({
      id: `sched-${s.id}`,
      type: 'scheduled',
      title: s.lead_name || s.lead_phone,
      subtitle: 'Llamada agendada',
      timestamp: s.updated_at,
      conversationId: s.id,
    });
  }

  // Sort by timestamp, deduplicate by conversationId (keep most recent)
  const seen = new Set<string>();
  const unique = items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .filter(item => {
      const key = item.conversationId || item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return unique.slice(0, limit);
}

/** Get upcoming scheduled calls with full details */
export async function getUpcomingCalls() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('leads_bolt')
    .select('id, name, phone, preferred_datetime, conversation_id, project_type, objective, notes')
    .eq('status', 'scheduled')
    .not('preferred_datetime', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}

/** Get average first response time in minutes */
export async function getAvgResponseTime(): Promise<number | null> {
  const supabase = getSupabaseAdmin();

  // Get first user message and first assistant message per conversation
  const { data: messages } = await supabase
    .from('messages')
    .select('conversation_id, role, timestamp')
    .in('role', ['user', 'assistant'])
    .order('timestamp', { ascending: true })
    .limit(1000);

  if (!messages || messages.length === 0) return null;

  // Group by conversation
  const convMsgs: Record<string, typeof messages> = {};
  for (const m of messages) {
    if (!convMsgs[m.conversation_id]) convMsgs[m.conversation_id] = [];
    convMsgs[m.conversation_id].push(m);
  }

  let totalMinutes = 0;
  let count = 0;

  for (const msgs of Object.values(convMsgs)) {
    const firstUser = msgs.find(m => m.role === 'user');
    const firstAssistant = msgs.find(m => m.role === 'assistant');
    if (firstUser && firstAssistant) {
      const diff = new Date(firstAssistant.timestamp).getTime() - new Date(firstUser.timestamp).getTime();
      if (diff > 0 && diff < 1000 * 60 * 60) { // < 1 hour to be valid
        totalMinutes += diff / (1000 * 60);
        count++;
      }
    }
  }

  return count > 0 ? Math.round((totalMinutes / count) * 10) / 10 : null;
}
