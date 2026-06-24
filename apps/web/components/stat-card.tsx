import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number;
  icon?: LucideIcon;
  /** clase de color para el icono y su halo, ej: 'text-blue-600' */
  accent?: string;
  /** clase de fondo suave del icono, ej: 'bg-blue-500/10' */
  iconBg?: string;
  animate?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'text-primary',
  iconBg = 'bg-primary/10',
  animate = true,
}: StatCardProps) {
  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      {/* halo decorativo */}
      <div className={cn('pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-60 blur-2xl', iconBg)} />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {Icon && (
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', iconBg)}>
              <Icon className={cn('h-4 w-4', accent)} />
            </div>
          )}
        </div>
        <p className={cn('mt-2 text-3xl font-bold tabular-nums tracking-tight', accent)}>
          {animate ? <AnimatedNumber value={value} /> : value}
        </p>
      </CardContent>
    </Card>
  );
}
