'use client';

import { useState, useEffect } from 'react';
import { Tag, Plus, X } from 'lucide-react';

const PRESET_TAGS = [
  { label: 'VIP', color: '#F5C300' },
  { label: 'Seguimiento', color: '#3b82f6' },
  { label: 'Urgente', color: '#ef4444' },
  { label: 'Presupuesto alto', color: '#22c55e' },
  { label: 'Referido', color: '#a855f7' },
  { label: 'Recontactar', color: '#f59e0b' },
];

interface ConversationTag {
  id: string;
  tag: string;
  color: string;
}

export default function TagManager({ conversationId }: { conversationId: string }) {
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [customTag, setCustomTag] = useState('');

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/tags`)
      .then(r => r.json())
      .then(d => setTags(d.tags || []))
      .catch(() => {});
  }, [conversationId]);

  async function addTag(label: string, color: string) {
    // Don't add duplicate
    if (tags.some(t => t.tag === label)) return;

    try {
      const res = await fetch(`/api/conversations/${conversationId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: label, color }),
      });
      if (res.ok) {
        const data = await res.json();
        setTags(prev => [...prev, data.tag]);
        setShowPicker(false);
        setCustomTag('');
      }
    } catch {
      // silent
    }
  }

  async function removeTag(tagId: string) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/tags?tagId=${tagId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTags(prev => prev.filter(t => t.id !== tagId));
      }
    } catch {
      // silent
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Tag size={12} color="var(--text-muted)" />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Etiquetas
        </span>
      </div>

      {/* Current tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {tags.map((t) => (
          <span
            key={t.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 12,
              background: `${t.color}18`,
              border: `1px solid ${t.color}40`,
              color: t.color,
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {t.tag}
            <button
              onClick={() => removeTag(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, lineHeight: 1 }}
            >
              <X size={10} color={t.color} />
            </button>
          </span>
        ))}

        <button
          onClick={() => setShowPicker(!showPicker)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '3px 8px',
            borderRadius: 12,
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          <Plus size={10} /> Agregar
        </button>
      </div>

      {/* Tag picker */}
      {showPicker && (
        <div
          style={{
            padding: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginTop: 4,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {PRESET_TAGS.filter(p => !tags.some(t => t.tag === p.label)).map((p) => (
              <button
                key={p.label}
                onClick={() => addTag(p.label, p.color)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  border: `1px solid ${p.color}40`,
                  background: `${p.color}10`,
                  color: p.color,
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = `${p.color}25`)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = `${p.color}10`)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom tag input */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="Etiqueta personalizada..."
              style={{
                flex: 1,
                padding: '5px 8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 11,
                outline: 'none',
                fontFamily: 'inherit',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customTag.trim()) {
                  addTag(customTag.trim(), '#60a5fa');
                }
              }}
            />
            <button
              onClick={() => customTag.trim() && addTag(customTag.trim(), '#60a5fa')}
              disabled={!customTag.trim()}
              style={{
                padding: '5px 8px',
                borderRadius: 6,
                border: 'none',
                background: customTag.trim() ? '#60a5fa' : 'var(--bg-surface)',
                color: customTag.trim() ? '#fff' : 'var(--text-muted)',
                fontSize: 11,
                cursor: customTag.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
