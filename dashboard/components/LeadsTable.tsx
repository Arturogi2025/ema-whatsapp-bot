'use client';

import { useRouter } from 'next/navigation';
import StatusBadge from './StatusBadge';
import { Phone, Briefcase, Calendar, Target } from 'lucide-react';
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
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
            <td style={{ padding: '14px 20px' }}>
              {lead.preferred_datetime ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={12} color="#22c55e" />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{lead.preferred_datetime}</span>
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
  );
}
