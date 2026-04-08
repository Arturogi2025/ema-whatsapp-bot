'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  ThumbsDown,
  CalendarClock,
  RefreshCw,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PostCallPanelProps {
  leadId: string;
  currentStatus: string;
  currentNotes: string | null;
}

type QuickAction = {
  label: string;
  emoji: string;
  newStatus: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
};

const ACTIONS: QuickAction[] = [
  {
    label: 'Propuesta enviada',
    emoji: '📄',
    newStatus: 'converted',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    icon: <CheckCircle2 size={13} />,
  },
  {
    label: 'Cliente cerrado',
    emoji: '🏆',
    newStatus: 'converted',
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.12)',
    icon: <CheckCircle2 size={13} />,
  },
  {
    label: 'Dar seguimiento',
    emoji: '🔄',
    newStatus: 'contacted',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    icon: <RefreshCw size={13} />,
  },
  {
    label: 'No le interesa',
    emoji: '❌',
    newStatus: 'lost',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    icon: <ThumbsDown size={13} />,
  },
];

export default function PostCallPanel({ leadId, currentStatus, currentNotes }: PostCallPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(currentNotes || '');
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function saveNotes() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/post-call`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Error al guardar notas');
        return;
      }
      setSuccess('Notas guardadas');
      setTimeout(() => setSuccess(null), 2500);
      router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  async function applyAction(action: QuickAction) {
    setActionSaving(action.label);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/post-call`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.newStatus, notes: notes || undefined }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Error al actualizar estado');
        return;
      }
      setSuccess(`Estado → ${action.newStatus}`);
      setTimeout(() => setSuccess(null), 2500);
      router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setActionSaving(null);
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--bg-elevated)',
      }}
    >
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardList size={14} style={{ color: '#a855f7' }} />
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            Retro post-llamada
          </span>
        </div>
        {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Quick-action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              ¿Qué pasó?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {ACTIONS.map(action => {
                const isActive = currentStatus === action.newStatus;
                const isSaving = actionSaving === action.label;
                return (
                  <button
                    key={action.label}
                    onClick={() => applyAction(action)}
                    disabled={!!actionSaving || saving}
                    title={action.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 10px',
                      borderRadius: 7,
                      border: `1px solid ${isActive ? action.color : 'var(--border)'}`,
                      background: isActive ? action.bg : 'var(--bg-surface)',
                      color: isActive ? action.color : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      cursor: actionSaving || saving ? 'not-allowed' : 'pointer',
                      opacity: actionSaving && !isSaving ? 0.6 : 1,
                      transition: 'all 0.15s',
                      textAlign: 'left',
                    }}
                  >
                    {isSaving
                      ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                      : <span style={{ flexShrink: 0 }}>{action.emoji}</span>
                    }
                    <span style={{ lineHeight: 1.2 }}>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes textarea */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notas internas
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="¿Qué comentó el cliente? ¿Próximos pasos?..."
              rows={3}
              disabled={saving || !!actionSaving}
              style={{
                width: '100%',
                fontSize: 13,
                padding: '8px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={saveNotes}
              disabled={saving || !!actionSaving || !notes.trim()}
              style={{
                alignSelf: 'flex-end',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                background: saving ? 'var(--bg-elevated)' : '#a855f7',
                color: saving ? 'var(--text-muted)' : '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: saving || !!actionSaving || !notes.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !notes.trim() ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              {saving
                ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</>
                : <><CalendarClock size={11} /> Guardar notas</>
              }
            </button>
          </div>

          {/* Feedback messages */}
          {success && (
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} /> {success}
            </div>
          )}
          {error && (
            <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
