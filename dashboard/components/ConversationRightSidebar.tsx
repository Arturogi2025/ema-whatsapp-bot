'use client';

import { useState } from 'react';
import { Info, X } from 'lucide-react';

export default function ConversationRightSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating toggle button - visible only on mobile/tablet via CSS */}
      <button
        className="right-sidebar-toggle"
        onClick={() => setOpen(true)}
        style={{
          display: 'none', /* shown via CSS on <=1024px */
          position: 'fixed',
          bottom: 80,
          right: 16,
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: '#F5C300',
          color: '#0a0a0a',
          cursor: 'pointer',
          zIndex: 50,
          boxShadow: '0 4px 20px rgba(245, 195, 0, 0.35)',
        }}
        title="Ver info"
      >
        <Info size={20} />
      </button>

      {/* Desktop: always visible sidebar */}
      <div
        className="conversation-sidebar conversation-sidebar-desktop"
        style={{
          width: 320,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        {children}
      </div>

      {/* Mobile/Tablet: overlay backdrop */}
      {open && (
        <div
          className="conversation-sidebar-overlay"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 100,
          }}
        />
      )}

      {/* Mobile/Tablet: slide-in drawer */}
      <div
        className="conversation-sidebar-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: open ? 0 : '-100%',
          width: '85vw',
          maxWidth: 360,
          height: '100vh',
          background: 'var(--bg-surface)',
          zIndex: 101,
          overflowY: 'auto',
          padding: '20px',
          transition: 'right 0.3s ease',
          boxShadow: open ? '-4px 0 24px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => setOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
