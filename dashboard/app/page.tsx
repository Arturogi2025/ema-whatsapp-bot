import { getStats, getDailyActivity, getConversationsWithPreview, getProjectTypeCounts, getCityDistribution, getAvgResponseTime, getRecentActivity, getUpcomingCalls } from '@/lib/queries';
import KpiCard from '@/components/KpiCard';
import ActivityChart from '@/components/charts/ActivityChart';
import StatusDonut from '@/components/charts/StatusDonut';
import RecentConversationsTable from '@/components/RecentConversationsTable';
import PeriodFilter from '@/components/PeriodFilter';
import AutoRefresh from '@/components/AutoRefresh';
import PushNotificationToggle from '@/components/PushNotificationToggle';
import { MessageSquare, Users, CalendarCheck, Zap, MapPin, Clock, TrendingUp, Bell, UserPlus, PhoneCall, Activity, Phone, Briefcase } from 'lucide-react';
import { fmtMX, parseMXDatetime } from '@/lib/tz';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import AgendaHeader from '@/components/AgendaHeader';
import ScheduleCallButton from '@/components/ScheduleCallButton';

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

function CardHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

const CITY_COLORS = ['#F5C300', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#60a5fa', '#f472b6'];

const ACTIVITY_ICONS: Record<string, { icon: typeof MessageSquare; color: string; bg: string }> = {
  new_conversation: { icon: MessageSquare, color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  new_lead: { icon: UserPlus, color: '#F5C300', bg: 'rgba(245,195,0,0.12)' },
  scheduled: { icon: PhoneCall, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  message: { icon: MessageSquare, color: '#a3a3a3', bg: 'rgba(163,163,163,0.1)' },
};

export default async function OverviewPage({ searchParams }: { searchParams: { period?: string } }) {
  const period = parseInt(searchParams.period || '14', 10) || 14;
  const days = searchParams.period === 'all' ? 365 : period;

  const [stats, activity, conversations, projectTypes, cityDist, avgResponseTime, recentActivity, upcomingCalls] = await Promise.all([
    getStats(),
    getDailyActivity(days),
    getConversationsWithPreview(),
    getProjectTypeCounts(),
    getCityDistribution(),
    getAvgResponseTime(),
    getRecentActivity(10),
    getUpcomingCalls(),
  ]);

  const recent = conversations.slice(0, 8);

  // Split calls into upcoming (future) and past
  const now = new Date();
  const upcomingCallsFiltered = upcomingCalls.filter(c =>
    c.preferred_datetime ? parseMXDatetime(c.preferred_datetime) >= now : false
  );
  const pastCalls = upcomingCalls.filter(c =>
    c.preferred_datetime ? parseMXDatetime(c.preferred_datetime) < now : false
  ).reverse(); // most recent past call first

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
    <div className="overview-page" style={{ padding: '32px 32px', maxWidth: 1280 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
            Overview
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PeriodFilter />
            {/* Push notification toggle — accessible on mobile here */}
            <div className="mobile-push-toggle" style={{ display: 'none' }}>
              <PushNotificationToggle />
            </div>
          </div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
          {fmtMX(new Date(), "EEEE d 'de' MMMM, yyyy")}
        </p>
      </div>

      {/* ═══ AGENDA — Upcoming Calls ═══ */}
      <div style={{ marginBottom: 28 }}>
        <AgendaHeader count={upcomingCallsFiltered.length} />

        {upcomingCallsFiltered.length === 0 ? (
          <Card style={{ padding: '40px 24px', textAlign: 'center' as const }}>
            <CalendarCheck size={36} color="var(--text-muted)" strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.4 }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No tienes llamadas agendadas</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>Cuando un lead confirme horario, aparecerá aquí</div>
            <div style={{ marginTop: 16 }}>
              <ScheduleCallButton label="Agendar primera llamada" />
            </div>
          </Card>
        ) : (
          <div
            className="agenda-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 12,
            }}
          >
            {upcomingCallsFiltered.map((call) => {
              const projectLabels: Record<string, string> = {
                web: 'Página web',
                ecommerce: 'Tienda online',
                landing: 'Landing page',
                redesign: 'Rediseño',
                custom: 'Sistema a medida',
              };
              const projectLabel = projectLabels[call.project_type || ''] || call.project_type || null;

              return (
                <Link
                  key={call.id}
                  href={`/conversations/${call.conversation_id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div
                    className="agenda-card"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '16px 20px',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      borderLeft: '3px solid #F5C300',
                    }}
                  >
                    {/* Name + project badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: 'rgba(245,195,0,0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: 14,
                            fontWeight: 700,
                            color: '#F5C300',
                          }}
                        >
                          {(call.name || call.phone || '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {call.name || 'Sin nombre'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                            <Phone size={11} />
                            {call.phone}
                          </div>
                        </div>
                      </div>
                      {projectLabel && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#F5C300',
                            background: 'rgba(245,195,0,0.1)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {projectLabel}
                        </span>
                      )}
                    </div>

                    {/* Date/time */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        fontWeight: 500,
                        marginBottom: call.objective || call.notes ? 8 : 0,
                      }}
                    >
                      <CalendarCheck size={13} color="var(--text-muted)" />
                      {fmtMX(parseMXDatetime(call.preferred_datetime!), "EEEE d 'de' MMMM · HH:mm'h'")}
                    </div>

                    {/* Objective or notes */}
                    {(call.objective || call.notes) && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Briefcase size={11} style={{ flexShrink: 0 }} />
                        {call.objective || call.notes}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ HISTORIAL DE LLAMADAS ═══ */}
      {pastCalls.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Clock size={15} color="var(--text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Historial de llamadas
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px' }}>
              {pastCalls.length}
            </span>
          </div>
          <Card>
            <div style={{ padding: '0' }}>
              {pastCalls.map((call, idx) => {
                const projectLabels: Record<string, string> = {
                  web: 'Página web', ecommerce: 'Tienda online',
                  landing: 'Landing page', redesign: 'Rediseño', custom: 'Sistema a medida',
                };
                const projectLabel = projectLabels[call.project_type || ''] || call.project_type || null;
                return (
                  <Link
                    key={call.id}
                    href={`/conversations/${call.conversation_id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 20px',
                        borderBottom: idx < pastCalls.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                        opacity: 0.7,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
                    >
                      {/* Avatar */}
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {(call.name || call.phone || '?').charAt(0).toUpperCase()}
                      </div>
                      {/* Name + phone */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {call.name || 'Sin nombre'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                          <Phone size={10} />
                          {call.phone}
                        </div>
                      </div>
                      {/* Date */}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <CalendarCheck size={12} />
                        {fmtMX(parseMXDatetime(call.preferred_datetime!), "d MMM · HH:mm'h'")}
                      </div>
                      {/* Project badge */}
                      {projectLabel && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                          {projectLabel}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      )}

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
      <div className="kpi-flex-row" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 24 }}>
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

      {/* Activity feed */}
      <Card style={{ marginBottom: 24 }}>
        <CardHeader
          title="Actividad reciente"
          sub="Últimos contactos y eventos"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Activity size={14} color="var(--brand)" />
              <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>En vivo</span>
            </div>
          }
        />
        <div style={{ padding: '16px 24px 20px' }}>
          {recentActivity.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Sin actividad reciente
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentActivity.map((item) => {
                const config = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.message;
                const Icon = config.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.conversationId ? `/conversations/${item.conversationId}` : '#'}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="activity-feed-item" style={{ cursor: 'pointer' }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          background: config.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={16} color={config.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {item.subtitle}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: es })}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </Card>

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

        <div className="overview-recent-table" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
