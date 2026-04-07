'use client';

import { useState } from 'react';
import { CalendarCheck, Plus, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import ScheduleCallModal from './ScheduleCallModal';

export default function AgendaHeader({ count }: { count: number }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(245,195,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CalendarCheck size={18} color="#F5C300" />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Mi Agenda
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {count === 0 ? 'Sin llamadas pendientes' : `${count} llamada${count !== 1 ? 's' : ''} agendada${count !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: '#F5C300',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            title="Agendar llamada"
          >
            <Plus size={18} />
          </button>
          <Link
            href="/leads?status=scheduled"
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
            Ver todos <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <ScheduleCallModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
