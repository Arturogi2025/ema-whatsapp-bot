import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client-side Supabase (for realtime subscriptions)
export function getSupabaseClient() {
  return createClient(url, anonKey);
}

// Server-side Supabase (for data fetching in server components)
export function getSupabaseAdmin() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
