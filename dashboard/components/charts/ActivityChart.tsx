'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DailyActivity } from '@/lib/types';

interface Props {
  data: DailyActivity[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 13,
      }}
    >
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>
        {format(parseISO(label), 'd MMM', { locale: es })}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.value}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {p.dataKey === 'conversations' ? 'conversaciones' : 'mensajes'}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function ActivityChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradMsg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={d => format(parseISO(d), 'd MMM', { locale: es })}
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="messages"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#gradMsg)"
          dot={false}
          activeDot={{ r: 4, fill: '#22c55e' }}
        />
        <Area
          type="monotone"
          dataKey="conversations"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#gradConv)"
          dot={false}
          activeDot={{ r: 4, fill: '#7c3aed' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
