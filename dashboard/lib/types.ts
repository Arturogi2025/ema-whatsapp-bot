export type ConversationStatus = 'active' | 'scheduled' | 'closed';
export type LeadStatus = 'new' | 'contacted' | 'scheduled' | 'converted' | 'lost';
export type MessageRole = 'user' | 'assistant' | 'system';
export type LeadTemperature = 'hot' | 'warm' | 'cold';

export interface Conversation {
  id: string;
  lead_phone: string;
  lead_name: string | null;
  status: ConversationStatus;
  source: string;
  message_count: number;
  ai_paused: boolean;
  auto_pause_reason?: string | null;
  last_customer_message_at?: string | null;
  followup_stage?: number;
  created_at: string;
  updated_at: string;
  // Computed fields
  last_message?: string | null;
  last_message_role?: string | null;
  last_message_sent_by?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  /** For assistant messages: 'ai' | 'manual' | 'cron' | 'template' */
  sent_by?: string | null;
}

export interface Lead {
  id: string;
  conversation_id: string;
  name: string | null;
  phone: string;
  project_type: string | null;
  objective: string | null;
  preferred_datetime: string | null;
  status: LeadStatus;
  created_at: string;
}

export interface DashboardStats {
  totalConversations: number;
  activeConversations: number;
  scheduledCalls: number;
  totalLeads: number;
  conversionRate: number;
  newThisWeek: number;
  avgResponseTime?: number;
}

export interface DailyActivity {
  date: string;
  conversations: number;
  messages: number;
}

export interface ProjectTypeCount {
  project_type: string;
  count: number;
}

export interface ConversationInsights {
  summary: string;
  leadTemperature: LeadTemperature;
  signals: string[];
  nextSteps: string[];
  city: string | null;
}
