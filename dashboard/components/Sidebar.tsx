'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Zap,
  LogOut,
} from 'lucide-react';
import PushNotificationToggle from './PushNotificationToggle';

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquare },
  { href: '/leads', label: 'Leads', icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div
          style={{
            width: 34,
            height: 34,
            background: '#F5C300',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(245,195,0,0.3)',
            flexShrink: 0,
          }}
        >
          <Zap size={18} color="#0a0a0a" strokeWidth={2.5} fill="#0a0a0a" />
        </div>
        <div className="sidebar-logo-text">
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '0.02em', fontFamily: "'Barlow Condensed', sans-serif" }}>
            BOLT<span style={{ color: '#F5C300' }}>.dev</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Dashboard
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="sidebar-section-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '0 12px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Principal
        </div>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="sidebar-nav-link"
              title={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-elevated)' : 'transparent',
                transition: 'all 0.15s',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                }
              }}
            >
              <Icon
                size={16}
                color={active ? '#F5C300' : 'currentColor'}
                strokeWidth={active ? 2.5 : 2}
                style={{ flexShrink: 0 }}
              />
              <span className="sidebar-label">{label}</span>
              {active && (
                <div
                  className="sidebar-active-dot"
                  style={{
                    marginLeft: 'auto',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#F5C300',
                    flexShrink: 0,
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer"
        style={{
          marginTop: 'auto',
          padding: '16px 12px 4px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <PushNotificationToggle />
        </div>
        <div className="sidebar-version" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          Bolt AI · WhatsApp · v1.0
        </div>
        <button
          onClick={handleLogout}
          title="Cerrar sesion"
          className="sidebar-logout-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '7px 10px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 0.15s',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
          }}
        >
          <LogOut size={13} style={{ flexShrink: 0 }} />
          <span className="sidebar-label">Cerrar sesion</span>
        </button>
      </div>
    </aside>
  );
}
