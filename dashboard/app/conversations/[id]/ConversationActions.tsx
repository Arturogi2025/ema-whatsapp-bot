'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Bot, UserCheck } from 'lucide-react';

interface ConversationActionsProps {
  conversationId: string;
  initialAiPaused: boolean;
}

export default function ConversationActions({
  conversationId,
  initialAiPaused,
}: ConversationActionsProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiPaused, setAiPaused] = useState(initialAiPaused);
  const [togglingAi, setTogglingAi] = useState(false);
  const [sendError, setSendError] = useState('');

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    setSendError('');

    try {
      const res = await fetch(`/api/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (res.ok) {
        setText('');
        router.refresh();
      } else {
        const data = await res.json();
        setSendError(data.error || 'Error al enviar');
      }
    } catch {
      setSendError('Error de conexión');
    } finally {
      setSending(false);
    }
  }

  async function handleToggleAi() {
    setTogglingAi(true);
    const newPaused = !aiPaused;

    try {
      const res = await fetch(`/api/conversations/${conversationId}/toggle-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_paused: newPaused }),
      });

      if (res.ok) {
        setAiPaused(newPaused);
        router.refresh();
      }
    } catch {
      // silent fail
    } finally {
      setTogglingAi(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '12px 16px',
        flexShrink: 0,
      }}
    >
      {/* AI toggle bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {aiPaused ? (
            <UserCheck size={13} color="#f59e0b" />
          ) : (
            <Bot size={13} color="#22c55e" />
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: aiPaused ? '#f59e0b' : '#22c55e',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {aiPaused ? 'Modo manual activo' : 'IA respondiendo'}
          </span>
        </div>

        <button
          onClick={handleToggleAi}
          disabled={togglingAi}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 7,
            border: `1px solid ${aiPaused ? '#f59e0b40' : '#22c55e40'}`,
            background: aiPaused ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)',
            color: aiPaused ? '#f59e0b' : '#22c55e',
            fontSize: 12,
            fontWeight: 600,
            cursor: togglingAi ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {togglingAi ? '...' : aiPaused ? '▶ Reactivar IA' : '⏸ Pausar IA'}
        </button>
      </div>

      {/* Reply box */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje manual... (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              fontSize: 14,
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              transition: 'border-color 0.2s',
              fontFamily: 'inherit',
            }}
            onFocus={e => ((e.target as HTMLTextAreaElement).style.borderColor = '#F5C300')}
            onBlur={e => ((e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)')}
          />
          {sendError && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
              ⚠ {sendError}
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            border: 'none',
            background:
              sending || !text.trim()
                ? 'var(--bg-elevated)'
                : 'linear-gradient(135deg, #F5C300, #F5C300)',
            color: sending || !text.trim() ? 'var(--text-muted)' : 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: sending || !text.trim() ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            transition: 'all 0.2s',
            boxShadow:
              sending || !text.trim()
                ? 'none'
                : '0 4px 16px rgba(124, 58, 237, 0.4)',
          }}
        >
          {sending ? (
            <div
              style={{
                width: 14,
                height: 14,
                border: '2px solid var(--text-muted)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
        Este mensaje se enviará directamente por WhatsApp desde el número de Bolt
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
