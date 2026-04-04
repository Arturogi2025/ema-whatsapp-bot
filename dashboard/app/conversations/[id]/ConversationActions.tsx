'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send, Bot, UserCheck, XCircle, RotateCcw,
  Plus, Image, FileText, Mic, MapPin, X,
  Paperclip,
} from 'lucide-react';
import QuickReplies from '@/components/QuickReplies';
import AiSuggestions from '@/components/AiSuggestions';
import TemplatePicker from '@/components/TemplatePicker';

interface ConversationActionsProps {
  conversationId: string;
  initialAiPaused: boolean;
  conversationStatus?: string;
  leadName?: string | null;
  leadStatus?: string;
  projectType?: string | null;
  preferredDatetime?: string | null;
}

type MediaType = 'image' | 'document' | 'audio' | 'location';

const MEDIA_OPTIONS: { type: MediaType; label: string; icon: any; color: string; accept?: string }[] = [
  { type: 'image', label: 'Imagen', icon: Image, color: '#F5C300', accept: 'image/*' },
  { type: 'document', label: 'Documento', icon: FileText, color: '#3b82f6', accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip' },
  { type: 'audio', label: 'Audio', icon: Mic, color: '#22c55e', accept: 'audio/*' },
  { type: 'location', label: 'Ubicacion', icon: MapPin, color: '#a855f7' },
];

export default function ConversationActions({
  conversationId,
  initialAiPaused,
  conversationStatus = 'active',
  leadName,
  leadStatus,
  projectType,
  preferredDatetime,
}: ConversationActionsProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiPaused, setAiPaused] = useState(initialAiPaused);
  const [togglingAi, setTogglingAi] = useState(false);
  const [sendError, setSendError] = useState('');
  const [status, setStatus] = useState(conversationStatus);
  const [changingStatus, setChangingStatus] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [activeMedia, setActiveMedia] = useState<MediaType | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/conversations/${conversationId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
      return null;
    } catch {
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSend() {
    if (sending || uploading) return;

    // File upload + send
    if (selectedFile && activeMedia) {
      setSending(true);
      setSendError('');
      const url = await uploadFile(selectedFile);
      if (!url) {
        setSendError('Error al subir archivo. Intenta con URL directa.');
        setSending(false);
        return;
      }
      try {
        const res = await fetch(`/api/conversations/${conversationId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaType: activeMedia,
            mediaUrl: url,
            caption: text.trim() || undefined,
          }),
        });
        if (res.ok) {
          setText('');
          setSelectedFile(null);
          setActiveMedia(null);
          router.refresh();
        } else {
          const data = await res.json();
          setSendError(data.error || 'Error al enviar');
        }
      } catch {
        setSendError('Error de conexion');
      } finally {
        setSending(false);
      }
      return;
    }

    // URL-based media send
    if (activeMedia && mediaUrl.trim()) {
      setSending(true);
      setSendError('');
      try {
        let body: any;
        if (activeMedia === 'location') {
          // Parse "lat,lng" or "lat, lng"
          const parts = mediaUrl.trim().split(',').map(s => s.trim());
          if (parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
            setSendError('Formato incorrecto. Usa: 19.4326,-99.1332');
            setSending(false);
            return;
          }
          body = {
            mediaType: 'location',
            latitude: Number(parts[0]),
            longitude: Number(parts[1]),
            locationName: text.trim() || undefined,
          };
        } else {
          body = {
            mediaType: activeMedia,
            mediaUrl: mediaUrl.trim(),
            caption: text.trim() || undefined,
          };
        }
        const res = await fetch(`/api/conversations/${conversationId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setText('');
          setMediaUrl('');
          setActiveMedia(null);
          router.refresh();
        } else {
          const data = await res.json();
          setSendError(data.error || 'Error al enviar');
        }
      } catch {
        setSendError('Error de conexion');
      } finally {
        setSending(false);
      }
      return;
    }

    // Text send
    if (!text.trim()) return;
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
      setSendError('Error de conexion');
    } finally {
      setSending(false);
    }
  }

  async function handleToggleAi() {
    setTogglingAi(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/toggle-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_paused: !aiPaused }),
      });
      if (res.ok) {
        setAiPaused(!aiPaused);
        router.refresh();
      }
    } catch {} finally {
      setTogglingAi(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    setChangingStatus(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
        router.refresh();
      }
    } catch {} finally {
      setChangingStatus(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileSelect(type: MediaType, accept?: string) {
    setActiveMedia(type);
    setShowAttachMenu(false);
    if (accept && fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setMediaUrl(''); // clear URL if file selected
    }
    e.target.value = ''; // reset so same file can be re-selected
  }

  const canSend = text.trim() || (activeMedia && (mediaUrl.trim() || selectedFile));

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '10px 16px', flexShrink: 0 }}>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {aiPaused ? <UserCheck size={12} color="#f59e0b" /> : <Bot size={12} color="#22c55e" />}
          <span style={{ fontSize: 10, fontWeight: 600, color: aiPaused ? '#f59e0b' : '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {aiPaused ? 'Modo manual' : 'IA activa'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {/* Close/Reopen — clearer labels */}
          <button
            onClick={() => handleStatusChange(status === 'closed' ? 'active' : 'closed')}
            disabled={changingStatus}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${status === 'closed' ? '#22c55e40' : '#ef444440'}`,
              background: status === 'closed' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: status === 'closed' ? '#22c55e' : '#ef4444',
              fontSize: 11, fontWeight: 600, cursor: changingStatus ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'closed' ? (
              <><RotateCcw size={10} /> Reabrir chat</>
            ) : (
              <><XCircle size={10} /> Finalizar conversacion</>
            )}
          </button>

          {/* AI toggle */}
          <button
            onClick={handleToggleAi}
            disabled={togglingAi}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${aiPaused ? '#f59e0b40' : '#22c55e40'}`,
              background: aiPaused ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
              color: aiPaused ? '#f59e0b' : '#22c55e',
              fontSize: 11, fontWeight: 600, cursor: togglingAi ? 'not-allowed' : 'pointer',
            }}
          >
            {togglingAi ? '...' : aiPaused ? 'Reactivar IA' : 'Pausar IA'}
          </button>
        </div>
      </div>

      {/* Template picker for when 24h window expires */}
      <TemplatePicker
        conversationId={conversationId}
        leadName={leadName}
        leadStatus={leadStatus}
        conversationStatus={status}
        projectType={projectType}
        preferredDatetime={preferredDatetime}
      />

      {/* Quick replies */}
      <QuickReplies onSelect={(t) => setText(t)} />

      {/* Selected file / media preview */}
      {activeMedia && (selectedFile || mediaUrl) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8,
          border: '1px solid var(--border)',
        }}>
          <Paperclip size={13} color="var(--text-muted)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#F5C300', textTransform: 'uppercase' }}>
              {activeMedia === 'image' ? 'Imagen' : activeMedia === 'document' ? 'Documento' : activeMedia === 'audio' ? 'Audio' : 'Ubicacion'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFile ? selectedFile.name : mediaUrl}
            </div>
          </div>
          <button
            onClick={() => { setActiveMedia(null); setSelectedFile(null); setMediaUrl(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} color="var(--text-muted)" />
          </button>
        </div>
      )}

      {/* URL input for media (when no file selected) */}
      {activeMedia && !selectedFile && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <input
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder={
              activeMedia === 'location'
                ? 'Coordenadas: 19.4326,-99.1332'
                : `URL del ${activeMedia === 'image' ? 'imagen' : activeMedia === 'audio' ? 'audio' : 'documento'} (https://...)`
            }
            style={{
              flex: 1, padding: '7px 10px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 7,
              color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>o</span>
          {activeMedia !== 'location' && (
            <button
              onClick={() => {
                const opt = MEDIA_OPTIONS.find(o => o.type === activeMedia);
                if (opt?.accept && fileInputRef.current) {
                  fileInputRef.current.accept = opt.accept;
                  fileInputRef.current.click();
                }
              }}
              style={{
                padding: '6px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Subir archivo
            </button>
          )}
          <button
            onClick={() => { setActiveMedia(null); setMediaUrl(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Dynamic AI Suggestions */}
      <AiSuggestions conversationId={conversationId} onSelect={(msg) => setText(msg)} />

      {/* Reply box */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {/* Attach button (+) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            style={{
              width: 40, height: 40, borderRadius: 10,
              border: '1px solid var(--border)',
              background: showAttachMenu ? 'rgba(245,195,0,0.1)' : 'var(--bg-elevated)',
              color: showAttachMenu ? '#F5C300' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}
            title="Adjuntar archivo"
          >
            <Plus size={18} style={{ transform: showAttachMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {/* Attachment popup menu */}
          {showAttachMenu && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 6, minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 20,
            }}>
              {MEDIA_OPTIONS.map(({ type, label, icon: Icon, color, accept }) => (
                <button
                  key={type}
                  onClick={() => {
                    if (type === 'location') {
                      setActiveMedia('location');
                      setShowAttachMenu(false);
                    } else {
                      handleFileSelect(type, accept);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 12px', background: 'transparent', border: 'none',
                    borderRadius: 7, cursor: 'pointer', transition: 'background 0.1s',
                    color: 'var(--text-secondary)', fontSize: 13,
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: `${color}15`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color={color} />
                  </div>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Textarea */}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeMedia ? 'Agregar texto o caption (opcional)...' : 'Escribe un mensaje... (Enter para enviar)'}
            rows={2}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 10, color: 'var(--text-primary)', fontSize: 14,
              resize: 'none', outline: 'none', lineHeight: 1.5,
              transition: 'border-color 0.2s', fontFamily: 'inherit',
            }}
            onFocus={e => ((e.target as HTMLTextAreaElement).style.borderColor = '#F5C300')}
            onBlur={e => ((e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)')}
          />
          {sendError && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
              {sendError}
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || uploading || !canSend}
          style={{
            width: 44, height: 44, borderRadius: 10, border: 'none',
            background: !canSend || sending ? 'var(--bg-elevated)' : '#F5C300',
            color: !canSend || sending ? 'var(--text-muted)' : '#0a0a0a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: !canSend || sending ? 'not-allowed' : 'pointer',
            flexShrink: 0, transition: 'all 0.2s',
            boxShadow: canSend && !sending ? '0 4px 16px rgba(245,195,0,0.4)' : 'none',
          }}
        >
          {sending || uploading ? (
            <div style={{
              width: 14, height: 14, border: '2px solid var(--text-muted)',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }} />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
