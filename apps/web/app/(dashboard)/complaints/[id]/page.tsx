'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { api, type Complaint, type Message } from '@/lib/api-client';
import { STATUS_LABELS, STATUS_COLORS, formatDate, cn } from '@/lib/utils';

const STATUSES = ['pending', 'in_progress', 'resolved', 'rejected'] as const;

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
      const updated = await api.complaints.updateStatus(
        id,
        newStatus,
        statusNote || undefined,
        token,
      );
      setComplaint(updated);
      setStatusNote('');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>;
  if (!complaint) return <div className="p-8 text-gray-400">Reclamo no encontrado</div>;

  return (
    <div className="p-8">
      <button
        onClick={() => router.back()}
        className="text-sm text-blue-600 hover:text-blue-800 mb-6 flex items-center gap-1"
      >
        ← Volver a reclamos
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel izquierdo: info del reclamo */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-xl font-bold text-gray-900">{complaint.summary}</h1>
              <span className={cn('px-3 py-1 rounded-full text-sm font-medium ml-4 shrink-0', STATUS_COLORS[complaint.status])}>
                {STATUS_LABELS[complaint.status]}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <InfoRow label="Categoría" value={complaint.category?.name ?? '—'} />
              <InfoRow label="Subcategoría" value={complaint.subcategory?.name ?? '—'} />
              <InfoRow label="Teléfono" value={complaint.phone_number} />
              <InfoRow label="Nombre" value={complaint.complainant_name ?? 'No informado'} />
              <InfoRow label="Ubicación" value={complaint.location ?? 'No informada'} />
              <InfoRow label="Fecha" value={formatDate(complaint.created_at)} />
              {complaint.ai_confidence !== null && (
                <InfoRow
                  label="Confianza IA"
                  value={`${Math.round(complaint.ai_confidence * 100)}%`}
                />
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Descripción completa</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{complaint.description}</p>
            </div>

            {complaint.status_note && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Nota del admin</p>
                <p className="text-sm text-gray-700">{complaint.status_note}</p>
              </div>
            )}
          </div>

          {/* Cambiar estado */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Cambiar estado</h2>
            <div className="space-y-3">
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Nota opcional (ej: se asignó cuadrilla)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                {STATUSES.filter((s) => s !== complaint.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={updating}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50',
                      s === 'resolved' ? 'bg-green-600 hover:bg-green-700 text-white' :
                      s === 'in_progress' ? 'bg-blue-600 hover:bg-blue-700 text-white' :
                      s === 'rejected' ? 'bg-red-600 hover:bg-red-700 text-white' :
                      'bg-gray-200 hover:bg-gray-300 text-gray-700',
                    )}
                  >
                    → {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Panel derecho: chat de WhatsApp */}
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ maxHeight: '75vh' }}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Conversación WhatsApp</h2>
            <p className="text-xs text-gray-500 mt-0.5">{messages.length} mensajes</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Sin mensajes</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex',
                    m.role === 'user' ? 'justify-start' : 'justify-end',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-xs px-4 py-2.5 rounded-2xl text-sm',
                      m.role === 'user'
                        ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                        : 'bg-blue-600 text-white rounded-tr-sm',
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p className={cn('text-xs mt-1', m.role === 'user' ? 'text-gray-400' : 'text-blue-200')}>
                      {formatDate(m.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-28 shrink-0">{label}:</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}
