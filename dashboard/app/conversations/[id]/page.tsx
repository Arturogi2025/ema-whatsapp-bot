import { getConversation, getMessages, getLeadByConversation } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';
import ConversationActions from './ConversationActions';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Phone,
  User,
  Briefcase,
  Calendar,
  MessageSquare,
  Bot,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const revalidate = 10;

function MessageBubble({
  role,
  content,
  timestamp,
}: {
  role: string;
  content: string;
  timestamp: string;
}) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  if (isSystem) return null; // hide system messages

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row' : 'row-reverse',
        gap: 10,
        alignItems: 'flex-end',
        marginBottom: 12,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isUser ? '#18181b' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
          border: isUser ? '1px solid #3f3f46' : 'none',
        }}
      >
        {isUser ? (
          <User size={13} color="#a1a1aa" />
        ) : (
          <Bot size={13} color="white" />
        )}
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: '72%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
          background: isUser ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #5b21b6, #7c3aed)',
          border: isUser ? '1px solid var(--border)' : 'none',
          boxShadow: isUser ? 'none' : '0 4px 20px rgba(124, 58, 237, 0.3)',
        }}
      >
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: isUser ? 'var(--text-primary)' : '#f3e8ff',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {content}
        </div>
        <div
          style={{
            fontSize: 11,
            color: isUser ? 'var(--text-muted)' : '#a78bfa80',
            marginTop: 4,
            textAlign: isUser ? 'left' : 'right',
          }}
        >
          {format(new Date(timestamp), 'HH:mm', { locale: es })}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  );
}

export default async function ConversationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [conversation, messages, lead] = await Promise.all([
    getConversation(params.id),
    getMessages(params.id),
    getLeadByConversation(params.id),
  ]);

  if (!conversation) notFound();

  // Group messages by date
  const messagesByDate: Record<string, typeof messages> = {};
  for (const msg of messages.filter(m => m.role !== 'system')) {
    const dateKey = format(new Date(msg.timestamp), 'yyyy-MM-dd');
    if (!messagesByDate[dateKey]) messagesByDate[dateKey] = [];
    messagesByDate[dateKey].push(msg);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Chat panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Chat header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <Link
            href="/conversations"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}
          >
            <ArrowLeft size={14} />
          </Link>

          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b0764, #5b21b6)',
              border: '2px solid #7c3aed40',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: '#c4b5fd',
            }}
          >
            {(conversation.lead_name || conversation.lead_phone).charAt(0).toUpperCase()}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              {conversation.lead_name || 'Sin nombre'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {conversation.lead_phone}
            </div>
          </div>

          <StatusBadge status={conversation.status} />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              padding: '5px 10px',
            }}
          >
            <MessageSquare size={13} color="var(--text-muted)" />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {messages.filter(m => m.role !== 'system').length} mensajes
            </span>
          </div>
        </div>

        {/* Messages */}
        <div
          id="messages-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {Object.keys(messagesByDate).length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <MessageSquare size={32} strokeWidth={1.5} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 14 }}>Sin mensajes</div>
            </div>
          ) : (
            Object.entries(messagesByDate).map(([date, msgs]) => (
              <div key={date}>
                {/* Date separator */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    margin: '16px 0',
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {format(new Date(date), "EEEE d 'de' MMMM", { locale: es })}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                {msgs.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Reply box + AI toggle */}
        <ConversationActions
          conversationId={params.id}
          initialAiPaused={(conversation as any).ai_paused ?? false}
        />
      </div>

      {/* Info sidebar */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          Información
        </div>

        {/* Conversation info */}
        <InfoRow icon={<Phone size={14} />} label="Teléfono" value={conversation.lead_phone} />
        <InfoRow icon={<User size={14} />} label="Nombre" value={conversation.lead_name || 'Sin nombre'} />
        <InfoRow
          icon={<Clock size={14} />}
          label="Iniciada"
          value={format(new Date(conversation.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
        />

        {/* Lead info */}
        {lead && (
          <>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                margin: '20px 0 16px',
              }}
            >
              Lead
            </div>

            {lead.project_type && (
              <InfoRow
                icon={<Briefcase size={14} />}
                label="Tipo de proyecto"
                value={lead.project_type}
              />
            )}

            {lead.preferred_datetime && (
              <InfoRow
                icon={<Calendar size={14} />}
                label="Horario preferido"
                value={lead.preferred_datetime}
              />
            )}

            <InfoRow
              icon={<User size={14} />}
              label="Estado del lead"
              value={lead.status}
            />

            {lead.objective && (
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>
                  Objetivo
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {lead.objective}
                </div>
              </div>
            )}
          </>
        )}

        {/* Stats */}
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: 'var(--bg-elevated)',
            borderRadius: 10,
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 12 }}>
            Resumen
          </div>
          {[
            {
              label: 'Mensajes usuario',
              value: messages.filter(m => m.role === 'user').length,
              color: 'var(--text-primary)',
            },
            {
              label: 'Respuestas IA',
              value: messages.filter(m => m.role === 'assistant').length,
              color: '#a855f7',
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
