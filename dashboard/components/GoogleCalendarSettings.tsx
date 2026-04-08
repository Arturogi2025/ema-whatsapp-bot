'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Check, Loader2, Unlink, RefreshCw } from 'lucide-react';

export default function GoogleCalendarSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      setJustConnected(true);
      // Clean URL
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((data) => {
        setConnected(data.connected);
        setEmail(data.email || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch('/api/google/disconnect', { method: 'POST' });
      setConnected(false);
      setEmail(null);
      setJustConnected(false);
    } catch {}
    setDisconnecting(false);
  }

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch('/api/leads/backfill-calendar', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setBackfillResult(`${data.synced} de ${data.total} llamadas sincronizadas`);
      } else {
        setBackfillResult(data.error || 'Error en backfill');
      }
    } catch {
      setBackfillResult('Error de conexion');
    }
    setBackfilling(false);
  }

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        Cargando...
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: connected ? 'rgba(34,197,94,0.12)' : 'rgba(163,163,163,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Calendar size={18} color={connected ? '#22c55e' : 'var(--text-muted)'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Google Calendar
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              Sincroniza llamadas agendadas con tu calendario
            </div>
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: connected ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
              color: connected ? '#22c55e' : '#ef4444',
            }}
          >
            {connected ? 'Conectado' : 'Desconectado'}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        {justConnected && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(34,197,94,0.1)',
              color: '#22c55e',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Check size={16} />
            Google Calendar conectado exitosamente
          </div>
        )}

        {connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {email && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Cuenta: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{email}</span>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Las llamadas agendadas se crean automaticamente como eventos en tu calendario con recordatorios de 15 y 5 minutos antes.
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {/* Backfill button */}
              <button
                onClick={handleBackfill}
                disabled={backfilling}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: backfilling ? 'not-allowed' : 'pointer',
                  opacity: backfilling ? 0.6 : 1,
                }}
              >
                <RefreshCw size={13} style={backfilling ? { animation: 'spin 1s linear infinite' } : undefined} />
                {backfilling ? 'Sincronizando...' : 'Sincronizar existentes'}
              </button>

              {/* Disconnect button */}
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#ef4444',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: disconnecting ? 'not-allowed' : 'pointer',
                  opacity: disconnecting ? 0.6 : 1,
                }}
              >
                <Unlink size={13} />
                {disconnecting ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>

            {backfillResult && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {backfillResult}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Conecta tu cuenta de Google para sincronizar automaticamente las llamadas agendadas con tu Google Calendar. Recibiras notificaciones push en tu celular antes de cada llamada.
            </div>
            <a
              href="/api/google/auth"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#F5C300',
                color: '#0a0a0a',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'none',
                width: 'fit-content',
              }}
            >
              <Calendar size={16} />
              Conectar Google Calendar
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
