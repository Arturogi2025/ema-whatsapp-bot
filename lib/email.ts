// Email notifications via Resend API
// Requires RESEND_API_KEY env var

const FROM_EMAIL = 'notificaciones@boltdevlabs.com';
const TO_EMAIL = 'hola@boltdevlabs.com';
const RESEND_API = 'https://api.resend.com/emails';

interface EmailPayload {
  subject: string;
  html: string;
}

async function sendEmail({ subject, html }: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not set, skipping notification');
    return;
  }

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('[Email] Resend error:', err);
    } else {
      console.log(`[Email] Sent: "${subject}"`);
    }
  } catch (err) {
    console.error('[Email] Network error:', err);
  }
}

function badge(color: string, text: string) {
  return `<span style="display:inline-block;padding:3px 10px;background:${color}22;color:${color};border-radius:20px;font-size:12px;font-weight:600;border:1px solid ${color}44;">${text}</span>`;
}

function row(label: string, value: string) {
  return `
    <tr>
      <td style="padding:8px 0;color:#a1a1aa;font-size:13px;width:140px;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;color:#fafafa;font-size:13px;font-weight:500;">${value}</td>
    </tr>`;
}

function emailTemplate(title: string, badgeHtml: string, rows: string, extra = '') {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:32px;background:#111115;border:1px solid #27272a;border-radius:16px;">
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:9px;display:flex;align-items:center;justify-content:center;">
        <span style="color:white;font-size:18px;font-weight:800;">⚡</span>
      </div>
      <div>
        <div style="color:#fafafa;font-weight:700;font-size:15px;">Bolt AI</div>
        <div style="color:#52525b;font-size:11px;">WhatsApp Dashboard</div>
      </div>
    </div>

    <!-- Badge + Title -->
    <div style="margin-bottom:20px;">
      ${badgeHtml}
      <h1 style="color:#fafafa;font-size:20px;font-weight:700;margin:10px 0 0;">${title}</h1>
    </div>

    <!-- Info table -->
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #27272a;margin-top:8px;">
      ${rows}
    </table>

    ${extra}

    <!-- Footer -->
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #27272a;text-align:center;">
      <p style="color:#3f3f46;font-size:11px;margin:0;">
        Bolt AI · WhatsApp · <a href="https://bolt-dashboard.vercel.app" style="color:#7c3aed;text-decoration:none;">Ver dashboard →</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function notifyNewLead(params: {
  name: string | null;
  phone: string;
  projectType: string | null;
  conversationId: string;
}): Promise<void> {
  const name = params.name || 'Sin nombre';
  const project = params.projectType || 'No especificado';
  const time = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const html = emailTemplate(
    '¡Nuevo lead en WhatsApp!',
    badge('#22c55e', '🔔 Nuevo lead'),
    row('Nombre', name) +
    row('Teléfono', params.phone) +
    row('Proyecto', project) +
    row('Hora', time),
    `<div style="margin-top:20px;">
      <a href="https://bolt-dashboard.vercel.app/conversations/${params.conversationId}"
         style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">
        Ver conversación →
      </a>
    </div>`
  );

  await sendEmail({
    subject: `🔔 Nuevo lead: ${name} — ${project}`,
    html,
  });
}

export async function notifyCallScheduled(params: {
  name: string | null;
  phone: string;
  datetime: string;
  conversationId: string;
}): Promise<void> {
  const name = params.name || 'Sin nombre';
  const time = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const html = emailTemplate(
    '¡Llamada agendada!',
    badge('#a855f7', '📅 Llamada agendada'),
    row('Nombre', name) +
    row('Teléfono', params.phone) +
    row('Horario', params.datetime) +
    row('Agendado a las', time),
    `<div style="margin-top:20px;">
      <a href="https://bolt-dashboard.vercel.app/conversations/${params.conversationId}"
         style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">
        Ver conversación →
      </a>
    </div>`
  );

  await sendEmail({
    subject: `📅 Llamada agendada: ${name} — ${params.datetime}`,
    html,
  });
}
