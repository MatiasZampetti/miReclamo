'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api, type Complaint, type Message } from '@/lib/api-client';
import { STATUS_LABELS, STATUS_COLORS, formatDate, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const STATUSES = ['pending', 'in_progress', 'resolved', 'rejected'] as const;

const STATUS_BTN: Record<string, string> = {
  resolved: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  in_progress: 'bg-blue-600 hover:bg-blue-700 text-white',
  rejected: 'bg-red-600 hover:bg-red-700 text-white',
  pending: 'bg-amber-500 hover:bg-amber-600 text-white',
};

export default function ComplaintDetailPage() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? '';
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      api.complaints.get(id, token),
      api.complaints.getMessages(id, token),
    ])
      .then(([c, m]) => { setComplaint(c); setMessages(m); })
      .finally(() => setLoading(false));
  }, [token, id]);

  async function handleStatusChange(newStatus: string) {
    if (!token || !complaint) return;
    setUpdating(true);
    try {
      const updated = await api.complaints.updateStatus(id, newStatus, statusNote || undefined, token);
      setComplaint(updated);
      setStatusNote('');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return (
    <div className="p-8 space-y-6">
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-96" /><Skeleton className="h-96" />
      </div>
    </div>
  );
  if (!complaint) return <div className="p-8 text-muted-foreground">Reclamo no encontrado</div>;

  return (
    <div className="p-8">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6 -ml-2 gap-1">
        <ArrowLeft className="h-4 w-4" /> Volver a reclamos
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel izquierdo */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4 gap-4">
                <h1 className="text-xl font-bold">{complaint.summary}</h1>
                <Badge variant="outline" className={cn('border-0 font-medium shrink-0', STATUS_COLORS[complaint.status])}>
                  {STATUS_LABELS[complaint.status]}
                </Badge>
              </div>

              <div className="space-y-3 text-sm">
                <InfoRow label="Categoría" value={complaint.category?.name ?? '—'} />
                <InfoRow label="Subcategoría" value={complaint.subcategory?.name ?? '—'} />
                <InfoRow label="Teléfono" value={complaint.phone_number} />
                <InfoRow label="Nombre" value={complaint.complainant_name ?? 'No informado'} />
                <InfoRow label="Ubicación" value={complaint.location ?? 'No informada'} />
                <InfoRow label="Fecha" value={formatDate(complaint.created_at)} />
                {complaint.ai_confidence !== null && (
                  <InfoRow label="Confianza IA" value={`${Math.round(complaint.ai_confidence * 100)}%`} />
                )}
              </div>

              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Descripción completa</p>
                <p className="text-sm whitespace-pre-wrap">{complaint.description}</p>
              </div>

              {complaint.status_note && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Nota del admin</p>
                  <p className="text-sm">{complaint.status_note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cambiar estado */}
          <Card>
            <CardHeader><CardTitle className="text-base">Cambiar estado</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Nota opcional (ej: se asignó cuadrilla)"
                className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                {STATUSES.filter((s) => s !== complaint.status).map((s) => (
                  <Button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={updating}
                    size="sm"
                    className={cn(STATUS_BTN[s])}
                  >
                    → {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Panel derecho: chat */}
        <Card className="flex flex-col" style={{ maxHeight: '75vh' }}>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Conversación WhatsApp</CardTitle>
            <p className="text-xs text-muted-foreground">{messages.length} mensajes</p>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Sin mensajes</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
                  <div
                    className={cn(
                      'max-w-xs px-4 py-2.5 rounded-2xl text-sm',
                      m.role === 'user'
                        ? 'bg-muted text-foreground rounded-tl-sm'
                        : 'bg-primary text-primary-foreground rounded-tr-sm',
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p className={cn('text-xs mt-1', m.role === 'user' ? 'text-muted-foreground' : 'text-primary-foreground/70')}>
                      {formatDate(m.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
