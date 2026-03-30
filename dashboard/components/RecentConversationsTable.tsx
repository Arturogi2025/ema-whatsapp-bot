'use client';

import { useRouter } from 'next/navigation';
import StatusBadge from './StatusBadge';
import { MessageSquare, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Conversation } from '@/lib/types';

export default function RecentConversationsTable({ conversations }: { conversations: Conversation[] }) {
  const router = useRouter();

  if (conversations.length === 0) {
    return (
      <tr>
        <td colSpan={5} style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          No hay conversaciones todavía. ¡Envía un mensaje de prueba!
        </td>
      </tr>
    );
  }

  return (
    <>
      {conversations.map((conv, i) => (
        <tr
          key={conv.id}
          style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          onClick={() => router.push(`/conversations/${conv.id}`)}
        >
          <td style={{ padding: '12px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: `hsl(${(i * 47) % 360}, 60%, 25%)`,
                  border: `2px solid hsl(${(i * 47) % 360}, 60%, 40%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  color: `hsl(${(i * 47) % 360}, 80%, 80%)`,
                  flexShrink: 0,
                }}
              >
                {(conv.lead_name || conv.lead_phone).charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                {conv.lead_name || 'Sin nombre'}
              </span>
            </div>
          </td>
          <td style={{ padding: '12px 24px' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {conv.lead_phone}
            </span>
          </td>
          <td style={{ padding: '12px 24px' }}><StatusBadge status={conv.status} /></td>
          <td style={{ padding: '12px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <MessageSquare size={13} color="var(--text-muted)" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{conv.message_count ?? '—'}</span>
            </div>
          </td>
          <td style={{ padding: '12px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={12} color="var(--text-muted)" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {formatDistanceToNow(new Date(conv.updated_at || conv.created_at), { addSuffix: true, locale: es })}
              </span>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
