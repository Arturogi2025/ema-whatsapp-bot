'use client';

import { useRouter } from 'next/navigation';
import StatusBadge from './StatusBadge';
import { MessageSquare, Clock, Phone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Conversation } from '@/lib/types';

export default function ConversationsTable({ conversations }: { conversations: Conversation[] }) {
  const router = useRouter();

  if (conversations.length === 0) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <MessageSquare size={40} color="var(--text-muted)" strokeWidth={1.5} />
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Sin conversaciones</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>El sistema está esperando mensajes.</div>
      </div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Lead', 'Teléfono', 'Estado', 'Mensajes', 'Fuente', 'Inicio', 'Última actividad'].map(h => (
            <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--bg-elevated)' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {conversations.map((conv, i) => (
          <tr
            key={conv.id}
            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            onClick={() => router.push(`/conversations/${conv.id}`)}
          >
            <td style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: `hsl(${(i * 53) % 360}, 55%, 22%)`, border: `2px solid hsl(${(i * 53) % 360}, 55%, 38%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: `hsl(${(i * 53) % 360}, 80%, 78%)`, flexShrink: 0 }}>
                  {(conv.lead_name || conv.lead_phone).charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {conv.lead_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin nombre</span>}
                </span>
              </div>
            </td>
            <td style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={12} color="var(--text-muted)" />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{conv.lead_phone}</span>
              </div>
            </td>
            <td style={{ padding: '14px 20px' }}><StatusBadge status={conv.status} /></td>
            <td style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <MessageSquare size={13} color="var(--text-muted)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{conv.message_count ?? '—'}</span>
              </div>
            </td>
            <td style={{ padding: '14px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px' }}>{conv.source}</span>
            </td>
            <td style={{ padding: '14px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {new Date(conv.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </span>
            </td>
            <td style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={12} color="var(--text-muted)" />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {formatDistanceToNow(new Date(conv.updated_at || conv.created_at), { addSuffix: true, locale: es })}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
