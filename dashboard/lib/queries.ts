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
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true });
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
