'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import ScheduleCallModal from './ScheduleCallModal';

interface ScheduleCallButtonProps {
  label?: string;
  style?: React.CSSProperties;
}

export default function ScheduleCallButton({ label = '+ Agendar llamada', style }: ScheduleCallButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid rgba(245,195,0,0.3)',
          background: 'rgba(245,195,0,0.08)',
          color: '#F5C300',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background 0.15s',
          ...style,
        }}
      >
        <Plus size={14} />
        {label}
      </button>

      <ScheduleCallModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
