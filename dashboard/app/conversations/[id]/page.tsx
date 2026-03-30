import { getConversation, getMessages, getLeadByConversation } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';
import ConversationActions from './ConversationActions';
import ConversationInsights from '@/components/ConversationInsights';
import ScrollToBottom from '@/components/ScrollToBottom';
import TagManager from '@/components/TagManager';
import InternalNotes from '@/components/InternalNotes';
import SoundAlert from '@/components/SoundAlert';
import AutoRefresh from '@/components/AutoRefresh';
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
  UserCheck,
} from 'lucide-react';
import { fmtMX } from '@/lib/tz';

export const dynamic = 'force-dynamic';

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

  if (isSystem) return null;

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
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isUser ? '#181818' : '#F5C300',
          border: isUser ? '1px solid #262626' : 'none',
        }}
      >
        {isUser ? (
          <User size={13} color="#a3a3a3" />
        ) : (
          <Bot size={13} color="#0a0a0a" />
        )}
      </div>

      <div
        style={{
          maxWidth: '72%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
          background: isUser ? 'var(--bg-elevated)' : '#F5C300',
          border: isUser ? '1px solid var(--border)' : 'none',
          boxShadow: isUser ? 'none' : '0 4px 20px rgba(245, 195, 0, 0.25)',
        }}
      >
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: isUser ? 'var(--text-primary)' : '#0a0a0a',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {content}
        </div>
        <div
          style={{
            fontSize: 11,
            color: isUser ? 'var(--text-muted)' : '#0a0a0a80',
            marginTop: 4,
            textAlign: isUser ? 'left' : 'right',
          }}
        >
          {fmtMX(timestamp, 'HH:mm')}
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
    const dateKey = fmtMX(msg.timestamp, 'yyyy-MM-dd');
    if (!messagesByDate[dateKey]) messagesByDate[dateKey] = [];
    messagesByDate[dateKey].push(msg);
  }

  // Count manual vs AI messages
  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const assistantMsgCount = messages.filter(m => m.role === 'assistant').length;
  const visibleMsgCount = messages.filter(m => m.role !== 'system').length;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Auto-refresh every 8 seconds for live conversation updates */}
      <AutoRefresh intervalMs={8000} />

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
              background: 'linear-gradient(135deg, #1a1400, #C49A00)',
              border: '2px solid #F5C30040',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: '#F5C300',
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
              {visibleMsgCount} mensajes
            </span>
          </div>

          <SoundAlert messageCount={visibleMsgCount} />
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
                    {fmtMX(date, "EEEE d 'de' MMMM")}
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
          {/* Auto-scroll to bottom */}
          <ScrollToBottom />
        </div>

        {/* Reply box + AI toggle */}
        <ConversationActions
          conversationId={params.id}
          initialAiPaused={(conversation as any).ai_paused ?? false}
          conversationStatus={conversation.status}
        />
      </div>

      {/* Info sidebar */}
      <div
        className="conversation-sidebar"
        style={{
          width: 320,
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
          value={fmtMX(conversation.created_at, "d MMM yyyy 'a las' HH:mm")}
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
              icon={<UserCheck size={14} />}
              label="Estado del lead"
              value={lead.status}
            />

            {lead.objective && (
              <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
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

        {/* Tags */}
        <TagManager conversationId={params.id} />

        {/* AI Insights */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            margin: '20px 0 0',
          }}
        >
          Inteligencia IA
        </div>
        <ConversationInsights conversationId={params.id} />

        {/* Internal Notes */}
        <InternalNotes conversationId={params.id} />

        {/* Stats */}
        <div
          style={{
            marginTop: 16,
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
              value: userMsgCount,
              color: 'var(--text-primary)',
            },
            {
              label: 'Respuestas IA',
              value: assistantMsgCount,
              color: '#F5C300',
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
