'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname.startsWith('/login');

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
