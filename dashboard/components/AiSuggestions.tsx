'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';

interface Suggestion {
  label: string;
  message: string;
}

interface AiSuggestionsProps {
  conversationId: string;
  onSelect: (message: string) => void;
}

export default function AiSuggestions({ conversationId, onSelect }: AiSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions, refreshKey]);

  // Re-fetch suggestions periodically (every 30s)
  useEffect(() => {
    const timer = setInterval(() => setRefreshKey(k => k + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading && suggestions.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
        <Sparkles size={12} color="#F5C300" />
        <div className="skeleton" style={{ height: 26, width: 200, borderRadius: 13 }} />
        <div className="skeleton" style={{ height: 26, width: 150, borderRadius: 13 }} />
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div style={{ padding: '4px 0 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Sparkles size={11} color="#F5C300" />
        <span style={{ fontSize: 10, fontWeight: 600, color: '#F5C300', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Sugerencias IA
        </span>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          title="Refrescar sugerencias"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            opacity: loading ? 0.3 : 0.6,
          }}
        >
          <RefreshCw size={10} color="var(--text-muted)" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {suggestions.map((s, i) => (
          <button
            key={`${s.label}-${i}`}
            onClick={() => onSelect(s.message)}
            title={s.message}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 18,
              border: '1px solid rgba(245, 195, 0, 0.25)',
              background: 'rgba(245, 195, 0, 0.06)',
              color: '#F5C300',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(245, 195, 0, 0.15)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245, 195, 0, 0.5)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(245, 195, 0, 0.06)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245, 195, 0, 0.25)';
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
