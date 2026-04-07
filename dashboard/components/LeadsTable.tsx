'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusBadge from './StatusBadge';
import { Phone, Briefcase, Calendar, Target, Pencil, Check, X, Loader2 } from 'lucide-react';
import { fmtMX } from '@/lib/tz';
import type { Lead } from '@/lib/types';

const PROJECT_TYPE_LABELS: Record<string, string> = {
  web: 'Página web',
  ecommerce: 'Tienda online',
  landing: 'Landing page',
  custom: 'Sistema a medida',
};

export default function LeadsTable({ leads, emptyMessage }: { leads: Lead[]; emptyMessage: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDatetime, setEditDatetime] = useState('');
  const [saving, setSaving] = useState(false);

  function toDatetimeLocal(iso: string): string {
    // Convert ISO or bare string to datetime-local format "YYYY-MM-DDTHH:mm"
    if (!iso) return '';
    // Strip timezone suffix for the input value
    const bare = iso.replace(/([+-]\d{2}:?\d{2}|Z)$/, '');
    // datetime-local needs exactly "YYYY-MM-DDTHH:mm"
    return bare.length >= 16 ? bare.slice(0, 16) : bare;
  }

  function startEdit(e: React.MouseEvent, lead: Lead) {
    e.stopPropagation();
    setEditingId(lead.id);
    setEditDatetime(toDatetimeLocal(lead.preferred_datetime || ''));
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(null);
  }

  async function saveReschedule(e: React.MouseEvent, leadId: string) {
    e.stopPropagation();
    if (!editDatetime) return;
    setSaving(true);
    try {
      await fetch('/api/leads/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, preferred_datetime: editDatetime }),
      });
      setEditingId(null);
      router.refresh();
    } catch {}
    setSaving(false);
  }

  if (leads.length === 0) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Target size={40} color="var(--text-muted)" strokeWidth={1.5} />
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Sin leads</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
      <thead>
        <tr>
          {['Lead', 'Teléfono', 'Tipo de proyecto', 'Horario preferido', 'Estado', 'Registrado'].map(h => (
            <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--bg-elevated)' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {leads.map((lead, i) => (
          <tr
            key={lead.id}
            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            onClick={() => router.push(`/conversations/${lead.conversation_id}`)}
          >
            <td style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: `hsl(${(i * 61) % 360}, 55%, 22%)`, border: `2px solid hsl(${(i * 61) % 360}, 55%, 38%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: `hsl(${(i * 61) % 360}, 80%, 78%)`, flexShrink: 0 }}>
                  {(lead.name || lead.phone).charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {lead.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin nombre</span>}
                </span>
              </div>
            </td>
            <td style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={12} color="var(--text-muted)" />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{lead.phone}</span>
              </div>
            </td>
            <td style={{ padding: '14px 20px' }}>
              {lead.project_type ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Briefcase size={12} color="#7c3aed" />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {PROJECT_TYPE_LABELS[lead.project_type] || lead.project_type}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin definir</span>
              )}
            </td>
            <td style={{ padding: '14px 20px' }} onClick={e => e.stopPropagation()}>
              {editingId === lead.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="datetime-local"
                    value={editDatetime}
                    onChange={e => setEditDatetime(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      colorScheme: 'dark',
                    }}
                  />
                  <button
                    onClick={(e) => saveReschedule(e, lead.id)}
                    disabled={saving}
                    style={{ background: '#22c55e', border: 'none', borderRadius: 5, padding: '4px 6px', cursor: 'pointer', display: 'flex' }}
                  >
                    {saving ? <Loader2 size={12} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} color="#fff" />}
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 6px', cursor: 'pointer', display: 'flex' }}
                  >
                    <X size={12} color="var(--text-muted)" />
                  </button>
                </div>
              ) : lead.preferred_datetime ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={12} color="#22c55e" />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{fmtMX(lead.preferred_datetime, 'd MMM HH:mm')}</span>
                  {lead.status === 'scheduled' && (
                    <button
                      onClick={(e) => startEdit(e, lead)}
                      title="Reagendar"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', opacity: 0.5 }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                    >
                      <Pencil size={11} color="var(--text-muted)" />
                    </button>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin agendar</span>
              )}
            </td>
            <td style={{ padding: '14px 20px' }}><StatusBadge status={lead.status} /></td>
            <td style={{ padding: '14px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {fmtMX(lead.created_at, 'd MMM yyyy')}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
