import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import DashboardNav from '@/components/dashboard-nav';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  const email = session.user?.email ?? '';
  const initials = email.slice(0, 2).toUpperCase() || 'AD';

  return (
    <div className="flex h-screen bg-muted/40">
      <aside className="w-64 bg-card border-r flex flex-col">
        {/* Branding */}
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <p className="text-sm font-bold leading-tight">miReclamo</p>
              <p className="text-xs text-muted-foreground">Municipalidad</p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <div className="flex-1 overflow-y-auto py-4">
          <DashboardNav />
        </div>

        {/* Usuario */}
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.user?.name ?? 'Administrador'}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <ThemeToggle />
          </div>
          <form
            action={async () => {
              'use server';
              const { signOut } = await import('@/lib/auth');
              await signOut({ redirectTo: '/login' });
            }}
          >
            <Button type="submit" variant="outline" size="sm" className="w-full justify-start gap-2">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
