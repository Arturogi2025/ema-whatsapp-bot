import { google } from 'googleapis';
import { getSupabaseAdmin } from './supabase';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];
const SETTINGS_KEY = 'google_calendar_tokens';

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  email?: string;
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
  );
}

/** Generate the Google OAuth2 authorization URL */
export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/** Exchange authorization code for tokens and store them */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  oauth2.setCredentials(tokens);

  // Get user email for display
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data } = await oauth2Api.userinfo.get();

  const storedTokens: GoogleTokens = {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date || 0,
    email: data.email || undefined,
  };

  // Save to Supabase settings
  const supabase = getSupabaseAdmin();
  await supabase
    .from('settings')
    .upsert(
      { key: SETTINGS_KEY, value: storedTokens, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  return storedTokens;
}

/** Load tokens from Supabase and return an authenticated OAuth2 client */
async function getAuthenticatedClient() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .single();

  if (!data) return null;

  const tokens = data.value as GoogleTokens;
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // Auto-refresh if expired
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const { credentials } = await oauth2.refreshAccessToken();
    const refreshed: GoogleTokens = {
      ...tokens,
      access_token: credentials.access_token!,
      expiry_date: credentials.expiry_date || 0,
    };
    await supabase
      .from('settings')
      .update({ value: refreshed, updated_at: new Date().toISOString() })
      .eq('key', SETTINGS_KEY);
    oauth2.setCredentials(credentials);
  }

  return oauth2;
}

/** Check if Google Calendar is connected */
export async function isGoogleConnected(): Promise<{ connected: boolean; email?: string }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .single();

  if (!data) return { connected: false };
  const tokens = data.value as GoogleTokens;
  return { connected: !!tokens.refresh_token, email: tokens.email };
}

/** Disconnect Google Calendar (delete tokens) */
export async function disconnectGoogle(): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('settings').delete().eq('key', SETTINGS_KEY);
}

/** Create a Google Calendar event for a scheduled call */
export async function createCalendarEvent(lead: {
  name: string | null;
  phone: string;
  project_type?: string | null;
  notes?: string | null;
  preferred_datetime: string;
}): Promise<string | null> {
  const auth = await getAuthenticatedClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: 'v3', auth });

  const projectLabels: Record<string, string> = {
    web: 'Pagina web',
    ecommerce: 'Tienda online',
    landing: 'Landing page',
    redesign: 'Rediseno',
    custom: 'Sistema a medida',
  };

  const projectLabel = lead.project_type ? projectLabels[lead.project_type] || lead.project_type : null;

  const descriptionParts = [
    `Telefono: ${lead.phone}`,
    projectLabel ? `Tipo: ${projectLabel}` : null,
    lead.notes ? `Notas: ${lead.notes}` : null,
    '',
    'Creado desde Bolt CRM',
  ].filter(Boolean);

  // Parse the datetime.
  // If preferred_datetime already has a timezone offset (e.g. "2026-04-08T09:00:00-06:00")
  // use it as-is. If it's a bare datetime-local string (e.g. "2026-04-08T09:00") with no
  // offset, treat it as Mexico City time (UTC-6, permanent since Mexico abolished DST in 2022).
  let startDate: Date;
  const hasTzOffset = /([+-]\d{2}:?\d{2}|Z)$/.test(lead.preferred_datetime);
  if (hasTzOffset) {
    startDate = new Date(lead.preferred_datetime);
  } else {
    // Append Mexico City offset so the server (which runs in UTC) parses it correctly
    startDate = new Date(lead.preferred_datetime + '-06:00');
  }

  // If the date is invalid, bail
  if (isNaN(startDate.getTime())) return null;

  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // +30 minutes

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `Llamada: ${lead.name || lead.phone}`,
      description: descriptionParts.join('\n'),
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 15 },
          { method: 'popup', minutes: 5 },
        ],
      },
    },
  });

  return event.data.id || null;
}

/** Delete a Google Calendar event */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const auth = await getAuthenticatedClient();
  if (!auth) return;

  const calendar = google.calendar({ version: 'v3', auth });
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId });
  } catch {
    // Event may have been manually deleted — ignore
  }
}
