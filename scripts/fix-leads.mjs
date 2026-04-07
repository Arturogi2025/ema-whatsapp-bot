/**
 * One-time script to fix scheduled leads' datetimes and add Alba Arnal Larrosa.
 * Run: node scripts/fix-leads.mjs
 */

const SUPABASE_URL = 'https://intuedwuuatfftiulvxy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImludHVlZHd1dWF0ZmZ0aXVsdnh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxODcyNiwiZXhwIjoyMDkwMzk0NzI2fQ.3qpw9g8H__crpAH0dPeGITowmpr5HKhJ4XVmpSrHtMs';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function supabase(method, table, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Fix datetimes: update + clear google_event_id so backfill can re-sync ──

const fixes = [
  // Stored as Mexico City time (UTC-6) — bare datetime-local format
  // createCalendarEvent now treats bare datetimes as Mexico City time
  { nameLike: 'mario',   preferred_datetime: '2026-04-07T12:00' },
  { nameLike: 'plomer',  preferred_datetime: '2026-04-08T09:00' },  // plomería
  { nameLike: 'judith',  preferred_datetime: '2026-04-07T09:00' },  // 11am NY EDT = 9am CDMX
  { nameLike: 'lopez',   preferred_datetime: '2026-04-08T12:00' },  // lopez arte fotográfico
];

async function fixLeads() {
  // Fetch all scheduled leads
  const leads = await supabase('GET', 'leads_bolt', null,
    '?status=eq.scheduled&select=id,name,phone,preferred_datetime,google_event_id'
  );

  console.log(`Found ${leads.length} scheduled leads:\n`);
  leads.forEach(l => console.log(`  • ${l.name} | ${l.preferred_datetime} | event_id: ${l.google_event_id ?? 'null'}`));
  console.log('');

  for (const fix of fixes) {
    const match = leads.find(l =>
      l.name?.toLowerCase().includes(fix.nameLike.toLowerCase())
    );

    if (!match) {
      console.log(`⚠️  No match found for "${fix.nameLike}" — skipping`);
      continue;
    }

    console.log(`📝 Updating "${match.name}": ${match.preferred_datetime} → ${fix.preferred_datetime}`);
    if (match.google_event_id) {
      console.log(`   (clearing old calendar event_id: ${match.google_event_id})`);
    }

    await supabase('PATCH', 'leads_bolt',
      { preferred_datetime: fix.preferred_datetime, google_event_id: null },
      `?id=eq.${match.id}`
    );
    console.log(`   ✅ Done`);
  }
}

// ── Add new lead: Alba Arnal Larrosa ──

async function addAlba() {
  const name = 'Alba Arnal Larrosa';
  const phone = '+34'; // placeholder — user needs to provide full number
  const preferred_datetime = '2026-04-08T08:00';
  const notes = 'Interdomicilio - ouicare iberia · España';

  // Check if already exists
  const existing = await supabase('GET', 'leads_bolt', null,
    `?name=ilike.*Alba Arnal*&select=id,name`
  );
  if (existing?.length > 0) {
    console.log(`\n⚠️  Alba Arnal Larrosa already exists (id: ${existing[0].id}) — skipping`);
    return;
  }

  console.log(`\n➕ Creating lead for "${name}"...`);

  // Create conversation
  const convResult = await supabase('POST', 'conversations',
    {
      lead_phone: phone,
      lead_name: name,
      status: 'scheduled',
      source: 'manual',
      message_count: 0,
      ai_paused: true,
    }
  );
  const conv = Array.isArray(convResult) ? convResult[0] : convResult;
  console.log(`   Conversation id: ${conv.id}`);

  // Create lead
  const leadResult = await supabase('POST', 'leads_bolt',
    {
      conversation_id: conv.id,
      name,
      phone,
      preferred_datetime,
      notes,
      status: 'scheduled',
    }
  );
  const lead = Array.isArray(leadResult) ? leadResult[0] : leadResult;
  console.log(`   ✅ Lead created (id: ${lead.id})`);
  console.log(`   ⚠️  Teléfono guardado como "+34" — actualiza el número completo desde el CRM`);
}

// ── Main ──
console.log('=== Fix Scheduled Leads ===\n');

fixLeads()
  .then(() => addAlba())
  .then(() => {
    console.log('\n✅ Script completado.');
    console.log('👉 Ve a /settings en el CRM y presiona "Sincronizar existentes" para crear los eventos en Calendar.');
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
