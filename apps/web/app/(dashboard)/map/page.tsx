'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { AlertTriangle, MapPinOff, RotateCw } from 'lucide-react';
import {
  api,
  type MapComplaint,
  type MapConfig,
  type Category,
} from '@/lib/api-client';
import { URGENCY_HEX, URGENCY_LABELS, cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Leaflet toca window/document al importarse: no puede renderizarse en el servidor.
const ComplaintsMap = dynamic(() => import('@/components/complaints-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const ALL = '__all__';
const URGENCIES = ['high', 'medium', 'low'] as const;

export default function MapPage() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? '';

  const [complaints, setComplaints] = useState<MapComplaint[]>([]);
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [unmapped, setUnmapped] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({ status: '', category_id: '', urgency: '' });

  useEffect(() => {
    if (!token) return;
    api.tenant.mapConfig(token).then(setConfig).catch(() => setError('No se pudo cargar la configuración del mapa'));
    api.categories.list(token).then(setCategories).catch(() => {});
  }, [token]);

  const fetchComplaints = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.complaints.map(filters, token);
      setComplaints(res.data);
      setUnmapped(res.unmapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los reclamos');
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  // Conteo por urgencia sobre lo que efectivamente se está mostrando
  const counts = useMemo(() => {
    const acc: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const c of complaints) if (c.urgency) acc[c.urgency] += 1;
    return acc;
  }, [complaints]);

  const hasFilters = Boolean(filters.status || filters.category_id || filters.urgency);

  return (
    <div className="flex h-full flex-col p-8">
      {/* Encabezado */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mapa de reclamos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {config?.city ?? 'Municipio'} · {complaints.length} reclamo{complaints.length !== 1 ? 's' : ''} ubicado
            {complaints.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Leyenda de urgencia: clickeable, funciona como filtro rápido */}
        <div className="flex flex-wrap items-center gap-2">
          {URGENCIES.map((u) => {
            const active = filters.urgency === u;
            return (
              <button
                key={u}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, urgency: active ? '' : u }))}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-foreground/25 bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/60',
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-inset"
                  style={{ backgroundColor: URGENCY_HEX[u].fill, color: URGENCY_HEX[u].stroke }}
                />
                {URGENCY_LABELS[u]}
                <span className="tabular-nums text-muted-foreground">{counts[u]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <Select
          value={filters.status || ALL}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v === ALL ? '' : v }))}
        >
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="in_progress">En proceso</SelectItem>
            <SelectItem value="resolved">Resuelto</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.category_id || ALL}
          onValueChange={(v) => setFilters((f) => ({ ...f, category_id: v === ALL ? '' : v }))}
        >
          <SelectTrigger className="w-[210px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ status: '', category_id: '', urgency: '' })}
          >
            Limpiar filtros
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {unmapped > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPinOff className="h-3.5 w-3.5" />
              {unmapped} sin ubicar
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchComplaints} disabled={loading} className="gap-1.5">
            <RotateCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="mb-4 flex items-center gap-2 border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </Card>
      )}

      {/* Mapa
          `isolate` es necesario: Leaflet apila sus panes entre z-index 400 y 1000
          y .leaflet-container no crea contexto de apilamiento propio, así que esos
          valores competirían en la raíz y taparían los dropdowns de los filtros
          (Radix los portalea al body con z-50). Aislando la Card, todo el z-index
          interno del mapa queda confinado acá adentro. */}
      <Card className="relative isolate min-h-[420px] flex-1 overflow-hidden p-0">
        {!config ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <>
            <ComplaintsMap complaints={complaints} config={config} />

            {!loading && complaints.length === 0 && (
              /* pointer-events-none: el cartel informa pero no bloquea el mapa */
              <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center p-6">
                <div className="pointer-events-auto max-w-sm rounded-lg border bg-card/95 p-6 text-center shadow-lg backdrop-blur">
                  <MapPinOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No hay reclamos para mostrar</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hasFilters
                      ? 'Ningún reclamo coincide con los filtros aplicados.'
                      : unmapped > 0
                        ? `Hay ${unmapped} reclamo(s) sin coordenadas. Corré el backfill de geocodificación para ubicarlos.`
                        : 'Todavía no se registraron reclamos.'}
                  </p>
                  {hasFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setFilters({ status: '', category_id: '', urgency: '' })}
                    >
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
