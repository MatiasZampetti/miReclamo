'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { Inbox, Clock, Loader, CheckCircle2 } from 'lucide-react';
import { api, type StatsSummary } from '@/lib/api-client';
import { STATUS_LABELS, STATUS_BAR_COLORS, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';

export default function StatsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? '';

  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [categoryData, setCategoryData] = useState<{ id: string; name: string; count: number }[]>([]);
  const [timelineData, setTimelineData] = useState<{ date: string; count: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setError(null);
    Promise.all([
      api.stats.summary(token),
      api.stats.categories(token),
      api.stats.timeline({ group_by: 'day' }, token),
    ])
      .then(([s, c, t]) => { setSummary(s); setCategoryData(c); setTimelineData(t); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar estadísticas'));
  }, [token]);

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

  const statusEntries = Object.entries(summary.by_status) as [string, number][];
  const pct = (n: number) => (summary.total > 0 ? Math.round((n / summary.total) * 100) : 0);

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
        {/* Reclamos por categoría */}
        <Card>
          <CardHeader><CardTitle className="text-base">Reclamos por categoría</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Reclamos" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Distribución por estado */}
        <Card>
          <CardHeader><CardTitle className="text-base">Distribución por estado</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {statusEntries.map(([status, count]) => (
              <div key={status}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{STATUS_LABELS[status]}</span>
                  <span className="text-muted-foreground">{count} ({pct(count)}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={cn('h-2 rounded-full transition-all', STATUS_BAR_COLORS[status])}
                    style={{ width: `${pct(count)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Reclamos en el tiempo</CardTitle></CardHeader>
        <CardContent>
          {timelineData.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} name="Reclamos" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
