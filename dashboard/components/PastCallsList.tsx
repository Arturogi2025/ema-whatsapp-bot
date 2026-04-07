'use client';

import { useRouter } from 'next/navigation';
import { Phone, CalendarCheck } from 'lucide-react';
import { fmtRelativeMX } from '@/lib/tz';

type PastCall = {
  id: string;
  name?: string | null;
  phone: string;
  preferred_datetime?: string | null;
  project_type?: string | null;
  conversation_id?: string | null;
};

const PROJECT_LABELS: Record<string, string> = {
  web: 'Página web',
  ecommerce: 'Tienda online',
  landing: 'Landing page',
  redesign: 'Rediseño',
  custom: 'Sistema a medida',
};

export default function PastCallsList({ calls }: { calls: PastCall[] }) {
  const router = useRouter();

  return (
    <>
      {calls.map((call, idx) => {
        const projectLabel = PROJECT_LABELS[call.project_type || ''] || call.project_type || null;
        return (
          <div
            key={call.id}
            onClick={() => call.conversation_id && router.push(`/conversations/${call.conversation_id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 20px',
              borderBottom: idx < calls.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
              transition: 'background 0.1s',
              opacity: 0.7,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
              (e.currentTarget as HTMLElement).style.opacity = '1';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.opacity = '0.7';
            }}
          >
            {/* Avatar */}
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
              {(call.name || call.phone || '?').charAt(0).toUpperCase()}
            </div>
            {/* Name + phone */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {call.name || 'Sin nombre'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <Phone size={10} />
                {call.phone}
              </div>
            </div>
            {/* Date */}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CalendarCheck size={12} />
              {fmtRelativeMX(call.preferred_datetime)}
            </div>
            {/* Project badge */}
            {projectLabel && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                {projectLabel}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
