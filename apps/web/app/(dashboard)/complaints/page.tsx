'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, X, Inbox, Clock, Loader, CheckCircle2 } from 'lucide-react';
import { api, type Complaint, type Category, type StatsSummary } from '@/lib/api-client';
import { STATUS_LABELS, STATUS_COLORS, formatDate, cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

export default function ComplaintsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? '';

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ status: '', category_id: '' });

  const fetchComplaints = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.complaints.list({ ...filters, page, limit: 20 }, token);
      setComplaints(res.data);
      setTotal(res.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [token, filters, page]);

  useEffect(() => {
    if (!token) return;
    api.categories.list(token).then(setCategories).catch(() => {});
    api.stats.summary(token).then(setSummary).catch(() => {});
  }, [token]);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  const hasFilters = filters.status || filters.category_id;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reclamos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} reclamo{total !== 1 ? 's' : ''} en total
          </p>
        </div>
      </div>

      {/* Resumen */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total" value={summary.total} icon={Inbox} accent="text-foreground" iconBg="bg-muted" />
          <StatCard label="Pendientes" value={summary.by_status.pending} icon={Clock} accent="text-amber-600 dark:text-amber-400" iconBg="bg-amber-500/10" />
          <StatCard label="En proceso" value={summary.by_status.in_progress} icon={Loader} accent="text-blue-600 dark:text-blue-400" iconBg="bg-blue-500/10" />
          <StatCard label="Resueltos" value={summary.by_status.resolved} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10" />
        </div>
      )}

      {/* Filtros */}
      <Card className="p-4 mb-6 flex gap-3 flex-wrap items-center">
        <Select
          value={filters.status || ALL}
          onValueChange={(v) => { setFilters((f) => ({ ...f, status: v === ALL ? '' : v })); setPage(1); }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
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
          onValueChange={(v) => { setFilters((f) => ({ ...f, category_id: v === ALL ? '' : v })); setPage(1); }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
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
            onClick={() => { setFilters({ status: '', category_id: '' }); setPage(1); }}
          >
            <X className="mr-1 h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : complaints.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No hay reclamos</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resumen</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complaints.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/complaints/${c.id}`} className="font-medium text-primary hover:underline">
                      {c.summary}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone_number}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('border-0 font-medium', STATUS_COLORS[c.status])}>
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Paginación */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= total}>
              Siguiente <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
