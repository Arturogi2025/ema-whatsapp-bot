'use client';

import { useEffect, useState } from 'react';
import {
  Thermometer,
  MapPin,
  Lightbulb,
  TrendingUp,
  Clock,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface InsightsData {
  temperature: 'hot' | 'warm' | 'cold';
  score: number;
  signals: string[];
  city: string | null;
  summary: string;
  nextSteps: string[];
  avgResponseMin: number | null;
  stats: {
    userMessages: number;
    aiMessages: number;
    totalMessages: number;
  };
}

const TEMP_CONFIG = {
  hot: { label: 'Caliente', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', emoji: '🔥' },
  warm: { label: 'Tibio', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', emoji: '🟡' },
  cold: { label: 'Frío', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', emoji: '🔵' },
};

export default function ConversationInsights({ conversationId }: { conversationId: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/insights`)
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [conversationId]);

  if (loading) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div className="skeleton" style={{ height: 120, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 80 }} />
      </div>
    );
  }

  if (!data || data.temperature === undefined) return null;

  const temp = TEMP_CONFIG[data.temperature];

  return (
    <div style={{ marginTop: 16 }}>
      {/* Lead Score */}
      <div
        style={{
          padding: 16,
          background: temp.bg,
          borderRadius: 10,
          border: `1px solid ${temp.border}`,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Thermometer size={14} color={temp.color} />
            <span style={{ fontSize: 11, fontWeight: 600, color: temp.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Lead Score
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: temp.color }}>
            {temp.emoji} {data.score}/100
          </span>
        </div>

        {/* Score bar */}
        <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${data.score}%`, background: temp.color, borderRadius: 3, transition: 'width 0.5s' }} />
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: temp.color }}>
          {temp.label}
        </div>
      </div>

      {/* City */}
      {data.city && (
        <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <MapPin size={14} color="var(--text-muted)" style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 2 }}>
              Ciudad
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{data.city}</div>
          </div>
        </div>
      )}

      {/* Avg response time */}
      {data.avgResponseMin !== null && (
        <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <Clock size={14} color="var(--text-muted)" style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 2 }}>
              Tiempo promedio de respuesta
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
              {data.avgResponseMin < 1 ? `${Math.round(data.avgResponseMin * 60)}s` : `${data.avgResponseMin} min`}
            </div>
          </div>
        </div>
      )}

      {/* AI Summary */}
      {data.summary && (
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Zap size={13} color="#F5C300" />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Resumen IA
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            {data.summary}
          </p>
        </div>
      )}

      {/* Signals */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: expanded ? 8 : 0,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%',
          }}
        >
          <TrendingUp size={13} color="#22c55e" />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, flex: 1, textAlign: 'left' }}>
            Señales ({data.signals.length})
          </span>
          {expanded ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
        </button>
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.signals.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#22c55e', marginTop: 6, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{s}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Next Steps */}
      <div style={{ padding: '12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Lightbulb size={13} color="#f59e0b" />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Sugerencias
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.nextSteps.map((step, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                background: 'rgba(245, 158, 11, 0.06)',
                border: '1px solid rgba(245, 158, 11, 0.15)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <AlertCircle size={12} color="#f59e0b" style={{ marginTop: 1, flexShrink: 0 }} />
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
