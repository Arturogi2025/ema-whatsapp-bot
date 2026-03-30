'use client';

import { useState, useEffect } from 'react';
import { StickyNote, Plus, Trash2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Note {
  id: string;
  content: string;
  created_at: string;
}

export default function InternalNotes({ conversationId }: { conversationId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/notes`)
      .then(r => r.json())
      .then(d => setNotes(d.notes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conversationId]);

  async function handleSave() {
    if (!newNote.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => [data.note, ...prev]);
        setNewNote('');
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(noteId: string) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/notes?noteId=${noteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
      }
    } catch {
      // silent
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <StickyNote size={13} color="#f59e0b" />
        Notas internas ({notes.length})
      </button>

      {expanded && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
        >
          {/* Add note */}
          <div style={{ display: 'flex', gap: 6, marginBottom: notes.length > 0 ? 12 : 0 }}>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Agregar nota privada..."
              rows={2}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                color: 'var(--text-primary)',
                fontSize: 12,
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.4,
              }}
              onFocus={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = '#f59e0b')}
              onBlur={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)')}
            />
            <button
              onClick={handleSave}
              disabled={saving || !newNote.trim()}
              style={{
                padding: '8px',
                borderRadius: 7,
                border: 'none',
                background: saving || !newNote.trim() ? 'var(--bg-surface)' : '#f59e0b',
                color: saving || !newNote.trim() ? 'var(--text-muted)' : '#0a0a0a',
                cursor: saving || !newNote.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'flex-end',
              }}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Notes list */}
          {loading ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>Cargando...</div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                style={{
                  padding: '8px 10px',
                  background: 'rgba(245, 158, 11, 0.05)',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                  borderRadius: 7,
                  marginBottom: 6,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                  {note.content}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={10} color="var(--text-muted)" />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: es })}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(note.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.5')}
                  >
                    <Trash2 size={11} color="#ef4444" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
