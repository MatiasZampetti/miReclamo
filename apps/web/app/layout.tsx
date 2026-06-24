import type { Metadata } from 'next';
import AuthSessionProvider from '@/components/session-provider';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'miReclamo — Panel Admin',
  description: 'Sistema de gestión de reclamos ciudadanos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
