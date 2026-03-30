import { getConversationsWithPreview } from '@/lib/queries';
import ConversationsTable from '@/components/ConversationsTable';
import SearchBar from '@/components/SearchBar';
import AutoRefresh from '@/components/AutoRefresh';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const FILTERS = ['all', 'active', 'scheduled', 'closed'] as const;
const FILTER_LABELS: Record<string, string> = { all: 'Todas', active: 'Activas', scheduled: 'Agendadas', closed: 'Cerradas' };

export default async function ConversationsPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status || 'all';
  const conversations = await getConversationsWithPreview(status);

  return (
    <div style={{ padding: '32px', maxWidth: 1280 }}>
      {/* Auto-refresh every 10 seconds for live conversation list updates */}
      <AutoRefresh intervalMs={10000} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>Conversaciones</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
            {conversations.length} conversaciones{status !== 'all' ? ` · filtro: ${FILTER_LABELS[status]}` : ''}
          </p>
        </div>
        <SearchBar />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, padding: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, width: 'fit-content' }}>
        {FILTERS.map(f => (
          <Link
            key={f}
            href={f === 'all' ? '/conversations' : `/conversations?status=${f}`}
            style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 13,
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
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <ConversationsTable conversations={conversations} />
      </div>
    </div>
  );
}
