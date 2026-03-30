'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const PERIODS = [
  { value: '7', label: '7 días' },
  { value: '14', label: '14 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: 'all', label: 'Todo' },
];

export default function PeriodFilter() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('period') || '14';

  function handleChange(value: string) {
    const url = value === '14' ? '/' : `/?period=${value}`;
    router.push(url);
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '3px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            border: 'none',
            fontSize: 11,
            fontWeight: current === value ? 600 : 400,
            color: current === value ? 'var(--text-primary)' : 'var(--text-muted)',
            background: current === value ? 'var(--bg-elevated)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
