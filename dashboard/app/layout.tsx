import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Bolt Dashboard',
  description: 'CRM y analytics de WhatsApp AI para Bolt',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {children}
        </main>
      </body>
    </html>
  );
}
