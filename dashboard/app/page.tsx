import { getStats, getDailyActivity, getConversationsWithPreview, getProjectTypeCounts, getCityDistribution, getAvgResponseTime } from '@/lib/queries';
import KpiCard from '@/components/KpiCard';
import ActivityChart from '@/components/charts/ActivityChart';
import StatusDonut from '@/components/charts/StatusDonut';
import RecentConversationsTable from '@/components/RecentConversationsTable';
import PeriodFilter from '@/components/PeriodFilter';
import AutoRefresh from '@/components/AutoRefresh';
import { MessageSquare, Users, CalendarCheck, Zap, MapPin, Clock, TrendingUp } from 'lucide-react';
import { fmtMX } from '@/lib/tz';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ padding: '20px 24px 0' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const CITY_COLORS = ['#F5C300', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#60a5fa', '#f472b6'];

export default async function OverviewPage({ searchParams }: { searchParams: { period?: string } }) {
  const period = parseInt(searchParams.period || '14', 10) || 14;
  const days = searchParams.period === 'all' ? 365 : period;

  const [stats, activity, conversations, projectTypes, cityDist, avgResponseTime] = await Promise.all([
    getStats(),
    getDailyActivity(days),
    getConversationsWithPreview(),
    getProjectTypeCounts(),
    getCityDistribution(),
    getAvgResponseTime(),
  ]);

  const recent = conversations.slice(0, 8);

  const statusData = [
    { name: 'Activos', value: stats.activeConversations, color: '#22c55e' },
    { name: 'Agendados', value: stats.scheduledCalls, color: '#F5C300' },
    {
      name: 'Cerrados',
      value: stats.totalConversations - stats.activeConversations - stats.scheduledCalls,
      color: '#3f3f46',
    },
  ].filter(d => d.value >= 0);

  const PROJECT_COLORS = ['#F5C300', '#22c55e', '#f59e0b', '#60a5fa', '#f472b6'];

  return (
    <div style={{ padding: '32px 32px', maxWidth: 1280 }}>
      {/* Auto-refresh every 15 seconds for live dashboard updates */}
      <AutoRefresh intervalMs={15000} />
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px #22c55e',
            }}
          />
          <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>Sistema activo</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
            Overview
          </h1>
          <PeriodFilter />
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
          {fmtMX(new Date(), "EEEE d 'de' MMMM, yyyy")}
        </p>
      </div>

      {/* KPI Grid */}
      <div
        className="kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label="Conversaciones totales"
          value={stats.totalConversations}
          sub={`${stats.newThisWeek} nuevas esta semana`}
          accent="#F5C300"
          icon={<MessageSquare size={16} />}
        />
        <KpiCard
          label="Conversaciones activas"
          value={stats.activeConversations}
          sub="En curso ahora"
          accent="#22c55e"
          icon={<Zap size={16} />}
        />
        <KpiCard
          label="Llamadas agendadas"
          value={stats.scheduledCalls}
          sub="Pendientes de realizar"
          accent="#F5C300"
          icon={<CalendarCheck size={16} />}
        />
        <KpiCard
          label="Total leads"
          value={stats.totalLeads}
          sub={`${stats.conversionRate}% tasa de conversión`}
          accent="#f59e0b"
          icon={<Users size={16} />}
        />
        {avgResponseTime !== null && (
          <KpiCard
            label="Tiempo de respuesta"
            value={avgResponseTime < 1 ? `${Math.round(avgResponseTime * 60)}s` : `${avgResponseTime}m`}
            sub="Promedio primera respuesta"
            accent="#3b82f6"
            icon={<Clock size={16} />}
          />
        )}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 24 }}>
        {/* Activity */}
        <Card>
          <CardHeader title="Actividad" sub={`Conversaciones y mensajes — últimos ${days} días`} />
          <div style={{ padding: '20px 8px 16px 16px' }}>
            <ActivityChart data={activity} />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 20,
              padding: '12px 24px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            {[
              { color: '#F5C300', label: 'Conversaciones' },
              { color: '#22c55e', label: 'Mensajes' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 3, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Status donut + project types + cities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHeader title="Estado de conversaciones" />
            <div style={{ padding: '24px' }}>
              <StatusDonut data={statusData} />
            </div>

            {/* Project types */}
            {projectTypes.length > 0 && (
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  padding: '16px 24px',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Por tipo de proyecto
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projectTypes.slice(0, 4).map((pt, i) => (
                    <div key={pt.project_type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PROJECT_COLORS[i % PROJECT_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, textTransform: 'capitalize' }}>
                        {pt.project_type}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {pt.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* City distribution */}
          {cityDist.length > 0 && (
            <Card>
              <div style={{ padding: '16px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <MapPin size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Leads por ciudad
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cityDist.slice(0, 6).map((c, i) => (
                    <div key={c.city} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: CITY_COLORS[i % CITY_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                        {c.city}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {c.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Recent conversations */}
      <Card>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Conversaciones recientes
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Últimas {recent.length} conversaciones
            </div>
          </div>
          <Link
            href="/conversations"
            style={{
              fontSize: 13,
              color: '#F5C300',
              textDecoration: 'none',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Ver todas →
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                {['Lead', 'Teléfono', 'Estado', 'Mensajes', 'Última actividad'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 24px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <RecentConversationsTable conversations={recent} />
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
