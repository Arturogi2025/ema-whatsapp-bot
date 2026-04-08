'use client';

import { useState } from 'react';
import { Pencil, Check, X, Loader2, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RescheduleButtonProps {
  leadId: string;
  currentDatetime: string; // ISO string e.g. "2026-04-08T16:00:00-06:00"
}

/** Format ISO datetime to local datetime-input value (YYYY-MM-DDTHH:mm) */
function toLocalInputValue(iso: string): string {
  // Parse treating as Mexico City time if no offset
  const hasTz = /([+-]\d{2}:?\d{2}|Z)$/.test(iso);
  const date = hasTz ? new Date(iso) : new Date(iso + '-06:00');
  // Format as YYYY-MM-DDTHH:mm in CDMX (UTC-6)
  const offsetMs = -6 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  return local.toISOString().slice(0, 16);
}

/** Convert local datetime-input value (YYYY-MM-DDTHH:mm) to CDMX ISO */
function toMXIso(localValue: string): string {
  return `${localValue}:00-06:00`;
}

export default function RescheduleButton({ leadId, currentDatetime }: RescheduleButtonProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => toLocalInputValue(currentDatetime));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/reschedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, newDatetime: toMXIso(value) }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Error al reagendar');
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(toLocalInputValue(currentDatetime));
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
          {currentDatetime}
        </span>
        <button
          onClick={() => setEditing(true)}
          title="Reagendar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 5,
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Pencil size={11} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        type="datetime-local"
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={saving}
        style={{
          fontSize: 13,
          padding: '5px 8px',
          borderRadius: 7,
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          outline: 'none',
          width: '100%',
          colorScheme: 'dark',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            background: '#22c55e',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={11} />}
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <X size={11} />
          Cancelar
        </button>
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>
      )}
    </div>
  );
}
