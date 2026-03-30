'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Users } from 'lucide-react';

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/conversations', label: 'Chats', icon: MessageSquare },
  { href: '/leads', label: 'Leads', icon: Users },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        display: 'none', // shown via CSS media query
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        zIndex: 50,
        justifyContent: 'space-around',
        padding: '6px 0 env(safe-area-inset-bottom, 6px)',
      }}
    >
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 16px',
              textDecoration: 'none',
              color: active ? '#F5C300' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: active ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
