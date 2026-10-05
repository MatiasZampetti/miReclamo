'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { motion } from 'motion/react';
import { Inbox, Clock, Loader, CheckCircle2 } from 'lucide-react';
import { api, type StatsSummary } from '@/lib/api-client';
import { STATUS_LABELS, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';

type Range = '7d' | '30d' | 'all';
const RANGES: { value: Range; label: string; days: number | null }[] = [
  { value: '7d', label: '7 días', days: 7 },
  { value: '30d', label: '30 días', days: 30 },
  { value: 'all', label: 'Todo', days: null },
];

const STATUS_HEX: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  resolved: '#10b981',
  rejected: '#ef4444',
};

const CATEGORY_GRADIENTS = [
  'from-blue-500 to-indigo-500',
  'from-violet-500 to-fuchsia-500',
  'from-cyan-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
];

const DAY_MS = 24 * 3600 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

/** Completa los días sin reclamos con 0 para que la curva no salte entre fechas. */
function fillDays(points: { date: string; count: number }[], days: number | null) {
  const counts = new Map(points.map((p) => [p.date, p.count]));
  const today = new Date();
  const start = days
    ? new Date(today.getTime() - (days - 1) * DAY_MS)
    : points.length > 0 ? new Date(`${points[0].date}T00:00:00Z`) : today;
  const out: { date: string; label: string; count: number }[] = [];
  for (let t = start.getTime(); isoDay(new Date(t)) <= isoDay(today); t += DAY_MS) {
    const key = isoDay(new Date(t));
    out.push({ date: key, label: shortDate(key), count: counts.get(key) ?? 0 });
  }
  return out;
}

const tooltipStyle = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 12,
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 10px 30px -10px rgb(0 0 0 / 0.25)',
  fontSize: 12,
};

export default function StatsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? '';

  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [categoryData, setCategoryData] = useState<{ id: string; name: string; count: number }[]>([]);
  const [timelineData, setTimelineData] = useState<{ date: string; count: number }[]>([]);
  const [range, setRange] = useState<Range>('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setError(null);
    Promise.all([api.stats.summary(token), api.stats.categories(token)])
      .then(([s, c]) => { setSummary(s); setCategoryData(c); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar estadísticas'));
  }, [token]);

  const rangeDays = RANGES.find((r) => r.value === range)?.days ?? null;

  useEffect(() => {
    if (!token) return;
    const params: { group_by: string; from?: string } = { group_by: 'day' };
    if (rangeDays) params.from = `${isoDay(new Date(Date.now() - (rangeDays - 1) * DAY_MS))}T00:00:00Z`;
    api.stats.timeline(params, token)
      .then(setTimelineData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar estadísticas'));
  }, [token, rangeDays]);

  const timeline = useMemo(() => fillDays(timelineData, rangeDays), [timelineData, rangeDays]);
  const sortedCategories = useMemo(
    () => [...categoryData].sort((a, b) => b.count - a.count),
    [categoryData],
  );

  if (error) return (
    <div className="p-8">
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-6 text-destructive">
          <p className="font-semibold mb-1">Error al cargar estadísticas</p>
          <p className="text-sm">{error}</p>
        </CardContent>
      </Card>
    </div>
  );

  if (!summary) return (
    <div className="p-8 space-y-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72" /><Skeleton className="h-72" />
      </div>
    </div>
  );

  const { total } = summary;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const statusSlices = (Object.entries(summary.by_status) as [string, number][])
    .map(([status, count]) => ({ status, name: STATUS_LABELS[status], value: count }));
  const maxCategory = sortedCategories[0]?.count ?? 0;
  const timelinePeak = timeline.reduce((max, p) => Math.max(max, p.count), 0);
  const timelineSum = timeline.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Estadísticas</h1>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total de reclamos" value={summary.total} icon={Inbox} accent="text-foreground" iconBg="bg-muted" />
        <StatCard label="Pendientes" value={summary.by_status.pending} icon={Clock} accent="text-amber-600 dark:text-amber-400" iconBg="bg-amber-500/10" />
        <StatCard label="En proceso" value={summary.by_status.in_progress} icon={Loader} accent="text-blue-600 dark:text-blue-400" iconBg="bg-blue-500/10" />
        <StatCard label="Resueltos" value={summary.by_status.resolved} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10" />
      </div>

      {summary.resolution_time_avg_hours !== null && (
        <Card className="mb-8 inline-block">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Tiempo promedio de resolución</p>
            <p className="text-2xl font-bold">{summary.resolution_time_avg_hours}h</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Reclamos por categoría: ranking con barras degradadas */}
        <Card>
          <CardHeader><CardTitle className="text-base">Reclamos por categoría</CardTitle></CardHeader>
          <CardContent>
            {sortedCategories.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin datos</p>
            ) : (
              <div className="space-y-4">
                {sortedCategories.map((cat, i) => (
                  <div key={cat.id}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                          {i + 1}
                        </span>
                        {cat.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {cat.count} <span className="text-xs">({pct(cat.count)}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn('h-full rounded-full bg-gradient-to-r', CATEGORY_GRADIENTS[i % CATEGORY_GRADIENTS.length])}
                        initial={{ width: 0 }}
                        animate={{ width: `${maxCategory ? (cat.count / maxCategory) * 100 : 0}%` }}
                        transition={{ duration: 0.9, delay: 0.1 * i, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribución por estado: dona con el total al centro */}
        <Card>
          <CardHeader><CardTitle className="text-base">Distribución por estado</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-48 w-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={total > 0 ? statusSlices : [{ status: 'empty', name: 'Sin datos', value: 1 }]}
                    dataKey="value"
                    innerRadius="68%"
                    outerRadius="100%"
                    paddingAngle={total > 0 ? 3 : 0}
                    cornerRadius={6}
                    stroke="none"
                  >
                    {(total > 0 ? statusSlices : [{ status: 'empty' }]).map((s) => (
                      <Cell key={s.status} fill={STATUS_HEX[s.status] ?? 'hsl(var(--muted))'} />
                    ))}
                  </Pie>
                  {total > 0 && <Tooltip contentStyle={tooltipStyle} />}
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-bold tabular-nums">{total}</p>
                <p className="text-xs text-muted-foreground">reclamos</p>
              </div>
            </div>
            <div className="w-full space-y-2">
              {statusSlices.map((s) => (
                <div key={s.status} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_HEX[s.status] }} />
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-auto tabular-nums">{s.value}</span>
                  <span className="w-10 text-right text-xs text-muted-foreground">{pct(s.value)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline: área con degradado y selector de período */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Reclamos en el tiempo</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {timelineSum} en el período · pico de {timelinePeak} en un día
            </p>
          </div>
          <div className="flex rounded-lg border bg-muted/50 p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  'relative rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  range === r.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {range === r.value && (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 rounded-md bg-background shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{r.label}</span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="timelineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="timelineStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'hsl(var(--primary))', strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="count"
                name="Reclamos"
                stroke="url(#timelineStroke)"
                strokeWidth={3}
                fill="url(#timelineFill)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
