const STATUS_MAP: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  // Conversation status
  active:    { label: 'Activo',    color: '#22c55e', bg: '#22c55e1a', dot: '#22c55e' },
  scheduled: { label: 'Agendado', color: '#a855f7', bg: '#a855f71a', dot: '#a855f7' },
  closed:    { label: 'Cerrado',  color: '#71717a', bg: '#71717a1a', dot: '#71717a' },
  // Lead status
  new:       { label: 'Nuevo',     color: '#60a5fa', bg: '#60a5fa1a', dot: '#60a5fa' },
  contacted: { label: 'Contactado',color: '#f59e0b', bg: '#f59e0b1a', dot: '#f59e0b' },
  converted: { label: 'Convertido',color: '#22c55e', bg: '#22c55e1a', dot: '#22c55e' },
  lost:      { label: 'Perdido',  color: '#ef4444', bg: '#ef44441a', dot: '#ef4444' },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: '#a1a1aa', bg: '#a1a1aa1a', dot: '#a1a1aa' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 20,
        background: s.bg,
        border: `1px solid ${s.color}30`,
        fontSize: 12,
        fontWeight: 500,
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.dot,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}
