import { getLeads, getStats } from '@/lib/queries';
import LeadsTable from '@/components/LeadsTable';
import ExportButton from '@/components/ExportButton';
import ScheduleCallButton from '@/components/ScheduleCallButton';
import { Users, Calendar, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const FILTERS = ['all', 'new', 'contacted', 'scheduled', 'converted', 'lost'] as const;
const FILTER_LABELS: Record<string, string> = { all: 'Todos', new: 'Nuevos', contacted: 'Contactados', scheduled: 'Agendados', converted: 'Convertidos', lost: 'Perdidos' };

export default async function LeadsPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status || 'all';
  const [leads, stats] = await Promise.all([getLeads(status), getStats()]);

  const kpis = [
    { label: 'Total leads', value: stats.totalLeads, icon: <Users size={15} />, color: '#7c3aed' },
    { label: 'Agendados', value: stats.scheduledCalls, icon: <Calendar size={15} />, color: '#a855f7' },
    { label: 'Tasa de conversión', value: `${stats.conversionRate}%`, icon: <TrendingUp size={15} />, color: '#22c55e' },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: 1280 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>Leads</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>CRM de prospectos generados via WhatsApp</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ScheduleCallButton />
          <ExportButton status={status} />
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="leads-kpi-row" style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, flex: 1 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, flexShrink: 0 }}>
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, padding: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, width: 'fit-content', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <Link key={f} href={f === 'all' ? '/leads' : `/leads?status=${f}`}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 13,
              fontWeight: f === status ? 600 : 400,
              color: f === status ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: f === status ? 'var(--bg-elevated)' : 'transparent',
              textDecoration: 'none', transition: 'all 0.15s',
              border: f === status ? '1px solid var(--border)' : '1px solid transparent',
            }}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="table-scroll-wrapper" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <LeadsTable
          leads={leads}
          emptyMessage={status === 'all'
            ? 'Los leads aparecen cuando un prospecto menciona su proyecto o agenda una llamada.'
            : `No hay leads con estado "${FILTER_LABELS[status]}".`}
        />
      </div>
    </div>
  );
}
