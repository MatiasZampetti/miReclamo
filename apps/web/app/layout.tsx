import type { Metadata } from 'next';
import AuthSessionProvider from '@/components/session-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'miReclamo — Panel Admin',
  description: 'Sistema de gestión de reclamos ciudadanos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
