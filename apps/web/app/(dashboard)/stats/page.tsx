'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { api, type StatsSummary } from '@/lib/api-client';
import { STATUS_LABELS, STATUS_COLORS, cn } from '@/lib/utils';

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
      .then(([s, c, t]) => {
        setSummary(s);
        setCategoryData(c);
        setTimelineData(t);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Error al cargar estadísticas');
      });
  }, [token]);

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-semibold mb-1">Error al cargar estadísticas</p>
        <p className="text-sm">{error}</p>
      </div>
    </div>
  );

  if (!summary) return <div className="p-8 text-gray-400">Cargando estadísticas...</div>;

  const statusEntries = Object.entries(summary.by_status) as [string, number][];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Estadísticas</h1>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total de reclamos" value={summary.total} color="text-gray-900" />
        <StatCard label="Pendientes" value={summary.by_status.pending} color="text-yellow-600" />
        <StatCard label="En proceso" value={summary.by_status.in_progress} color="text-blue-600" />
        <StatCard label="Resueltos" value={summary.by_status.resolved} color="text-green-600" />
      </div>

      {summary.resolution_time_avg_hours !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-8 inline-block">
          <p className="text-sm text-gray-500">Tiempo promedio de resolución</p>
          <p className="text-2xl font-bold text-gray-900">{summary.resolution_time_avg_hours}h</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Reclamos por categoría */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Reclamos por categoría</h2>
          {categoryData.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Reclamos" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribución por estado */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Distribución por estado</h2>
          <div className="space-y-3">
            {statusEntries.map(([status, count]) => (
              <div key={status}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={cn('font-medium', STATUS_COLORS[status].split(' ')[1])}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-gray-500">{count} ({summary.total > 0 ? Math.round(count / summary.total * 100) : 0}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={cn('h-2 rounded-full', status === 'resolved' ? 'bg-green-500' : status === 'in_progress' ? 'bg-blue-500' : status === 'rejected' ? 'bg-red-500' : 'bg-yellow-500')}
                    style={{ width: `${summary.total > 0 ? (count / summary.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Reclamos en el tiempo</h2>
        {timelineData.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin datos</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Reclamos" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={cn('text-3xl font-bold mt-1', color)}>{value}</p>
    </div>
  );
}
