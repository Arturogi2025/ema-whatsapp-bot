import type { Metadata } from 'next';
import './globals.css';
import DashboardShell from '@/components/DashboardShell';

export const metadata: Metadata = {
  title: 'Bolt Dashboard',
  description: 'CRM y analytics de WhatsApp AI para Bolt',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ background: 'var(--bg-base)' }}>
        <DashboardShell>
          {children}
        </DashboardShell>
      </body>
    </html>
  );
}
