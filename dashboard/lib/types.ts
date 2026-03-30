export type ConversationStatus = 'active' | 'scheduled' | 'closed';
export type LeadStatus = 'new' | 'contacted' | 'scheduled' | 'converted' | 'lost';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Conversation {
  id: string;
  lead_phone: string;
  lead_name: string | null;
  status: ConversationStatus;
  source: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
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
