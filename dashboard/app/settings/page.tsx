import { Settings } from 'lucide-react';
import GoogleCalendarSettings from '@/components/GoogleCalendarSettings';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div style={{ padding: '32px', maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Settings size={20} color="var(--text-muted)" />
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
            Ajustes
          </h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
          Integraciones y configuracion del sistema
        </p>
      </div>

      {/* Integraciones */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 12,
          }}
        >
          Integraciones
        </div>
        <GoogleCalendarSettings />
      </div>
    </div>
  );
}
