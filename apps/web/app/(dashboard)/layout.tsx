import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import DashboardNav from '@/components/dashboard-nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">miReclamo</p>
              <p className="text-xs text-gray-500">Municipalidad</p>
            </div>
          </div>
        </div>

        <DashboardNav />

        <div className="p-4 border-t border-gray-200 mt-auto">
          <p className="text-xs text-gray-500 truncate mb-2">{session.user?.email}</p>
          <form
            action={async () => {
              'use server';
              const { signOut } = await import('@/lib/auth');
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button
              type="submit"
              className="w-full text-left text-sm text-gray-600 hover:text-gray-900 transition"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
