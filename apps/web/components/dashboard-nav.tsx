'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, FolderTree, BarChart3, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/complaints', label: 'Reclamos', icon: FileText },
  { href: '/categories', label: 'Categorías', icon: FolderTree },
  { href: '/stats', label: 'Estadísticas', icon: BarChart3 },
];

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="px-4 space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
            )}
            <Icon className={cn('h-4 w-4 transition-transform', !active && 'group-hover:scale-110')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
