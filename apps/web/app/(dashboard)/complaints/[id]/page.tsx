'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Bot, Headset, Send, Loader2, AlertTriangle, Clock, Ban, ShieldCheck,
} from 'lucide-react';
import { api, type Complaint, type Message, type ConversationState } from '@/lib/api-client';
import {
  STATUS_LABELS, STATUS_COLORS, URGENCY_LABELS, URGENCY_COLORS, URGENCY_HEX,
  formatDate, cn,
} from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const STATUSES = ['pending', 'in_progress', 'resolved', 'rejected'] as const;
const URGENCIES = ['high', 'medium', 'low'] as const;

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

  // Toma de control humana de la conversación
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [chatError, setChatError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const humano = conversation?.mode === 'human';

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      api.complaints.get(id, token),
      api.complaints.getMessages(id, token),
      api.complaints.conversation(id, token).catch(() => null),
    ])
      .then(([c, m, conv]) => { setComplaint(c); setMessages(m); setConversation(conv); })
      .finally(() => setLoading(false));
  }, [token, id]);

  const refreshChat = useCallback(async () => {
    if (!token || !id) return;
    const [m, conv] = await Promise.all([
      api.complaints.getMessages(id, token),
      api.complaints.conversation(id, token),
    ]);
    setMessages(m);
    setConversation(conv);
  }, [token, id]);

  // Mientras el admin atiende, el vecino puede escribir en cualquier momento.
  // No hay websockets en el proyecto, así que se refresca por polling y solo
  // durante la toma de control, para no golpear la API el resto del tiempo.
  useEffect(() => {
    if (!humano) return;
    const timer = setInterval(() => { refreshChat().catch(() => {}); }, 8000);
    return () => clearInterval(timer);
  }, [humano, refreshChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function toggleMode() {
    if (!token || !conversation) return;
    setSwitching(true);
    setChatError('');
    try {
      setConversation(
        humano
          ? await api.complaints.release(id, token)
          : await api.complaints.takeover(id, token),
      );
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'No se pudo cambiar el modo');
    } finally {
      setSwitching(false);
    }
  }

  async function handleUnblock() {
    if (!token) return;
    setSwitching(true);
    setChatError('');
    try {
      setConversation(await api.complaints.unblock(id, token));
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'No se pudo desbloquear el número');
    } finally {
      setSwitching(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!token || !content || sending) return;

    setSending(true);
    setChatError('');
    try {
      await api.complaints.reply(id, content, token);
      setDraft('');
      await refreshChat();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  async function handleUrgencyChange(newUrgency: string) {
    if (!token || !complaint || newUrgency === complaint.urgency) return;
    setUpdating(true);
    try {
      setComplaint(await api.complaints.updateUrgency(id, newUrgency, token));
    } finally {
      setUpdating(false);
    }
  }

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
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {complaint.urgency && (
                    <Badge variant="outline" className={cn('border-0 font-medium', URGENCY_COLORS[complaint.urgency])}>
                      {URGENCY_LABELS[complaint.urgency]}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn('border-0 font-medium', STATUS_COLORS[complaint.status])}>
                    {STATUS_LABELS[complaint.status]}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <InfoRow label="Categoría" value={complaint.category?.name ?? '—'} />
                <InfoRow label="Subcategoría" value={complaint.subcategory?.name ?? '—'} />
                <InfoRow label="Teléfono" value={complaint.phone_number} />
                <InfoRow label="Nombre" value={complaint.complainant_name ?? 'No informado'} />
                <InfoRow label="Ubicación" value={complaint.location ?? 'No informada'} />
                <InfoRow
                  label="En el mapa"
                  value={
                    complaint.latitude != null
                      ? `${complaint.latitude.toFixed(5)}, ${complaint.longitude?.toFixed(5)}`
                      : complaint.geocode_status === 'not_found'
                        ? 'No se pudo ubicar la dirección'
                        : 'Pendiente de geocodificar'
                  }
                />
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

          {/* Urgencia — define el color del círculo en el mapa */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Grado de urgencia</CardTitle>
              <p className="text-xs text-muted-foreground">
                {complaint.urgency_source === 'manual'
                  ? 'Ajustado manualmente por un administrador.'
                  : 'Estimado por la IA a partir de la conversación. Podés corregirlo.'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {URGENCIES.map((u) => {
                  const active = complaint.urgency === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => handleUrgencyChange(u)}
                      disabled={updating}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60',
                        active
                          ? 'border-foreground/25 bg-accent text-accent-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: URGENCY_HEX[u].fill }}
                      />
                      {URGENCY_LABELS[u]}
                    </button>
                  );
                })}
              </div>
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Conversación WhatsApp</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {messages.length} mensaje{messages.length !== 1 ? 's' : ''} · {complaint.phone_number}
                </p>
              </div>

              {conversation && (
                <Button
                  onClick={toggleMode}
                  disabled={switching}
                  size="sm"
                  variant={humano ? 'default' : 'outline'}
                  className="gap-1.5"
                >
                  {switching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : humano ? (
                    <Headset className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                  {humano ? 'Atendiendo vos' : 'Atiende el agente'}
                </Button>
              )}
            </div>

            {/* Estado del modo, explicado sin jerga */}
            {conversation && (
              <p className="mt-2 text-xs text-muted-foreground">
                {humano
                  ? 'El agente IA no va a responder. Los mensajes del vecino llegan acá y le contestás vos.'
                  : 'El agente IA responde automáticamente. Tocá el botón para tomar la conversación.'}
              </p>
            )}

            {/* Va acá y no en el compositor: si falla el cambio de modo, el
                compositor no llega a renderizarse y el error quedaría invisible. */}
            {chatError && (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{chatError}</span>
              </p>
            )}

            {!conversation && !loading && (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>No se pudo leer el estado de la conversación. Recargá la página.</span>
              </p>
            )}

            {/* Número bloqueado por mensajes fuera de tema */}
            {conversation?.blocked && (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
                  <Ban className="h-3.5 w-3.5 shrink-0" />
                  Número bloqueado
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {conversation.blocked_at && `Desde el ${formatDate(conversation.blocked_at)}. `}
                  Sus mensajes se descartan sin llegar al agente.
                  {conversation.blocked_reason && (
                    <> Motivo registrado: “{conversation.blocked_reason}”.</>
                  )}
                </p>
                <Button
                  onClick={handleUnblock}
                  disabled={switching}
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-1.5"
                >
                  {switching
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ShieldCheck className="h-3.5 w-3.5" />}
                  Desbloquear número
                </Button>
              </div>
            )}

            {/* Avisos acumulados sin llegar al bloqueo */}
            {conversation && !conversation.blocked && conversation.offtopic_strikes > 0 && (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  {conversation.offtopic_strikes} aviso
                  {conversation.offtopic_strikes !== 1 ? 's' : ''} por mensajes fuera de tema.
                  El número se bloquea automáticamente al tercero.
                </span>
              </p>
            )}
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Sin mensajes</p>
            ) : (
              messages.map((m) => {
                const delVecino = m.role === 'user';
                return (
                  <div key={m.id} className={cn('flex', delVecino ? 'justify-start' : 'justify-end')}>
                    <div
                      className={cn(
                        'max-w-xs rounded-2xl px-4 py-2.5 text-sm',
                        delVecino && 'rounded-tl-sm bg-muted text-foreground',
                        m.role === 'assistant' && 'rounded-tr-sm bg-primary text-primary-foreground',
                        // El admin se distingue del agente para saber quién dijo qué
                        m.role === 'admin' && 'rounded-tr-sm bg-emerald-600 text-white',
                      )}
                    >
                      {!delVecino && (
                        <p
                          className={cn(
                            'mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide',
                            m.role === 'admin' ? 'text-white/80' : 'text-primary-foreground/75',
                          )}
                        >
                          {m.role === 'admin' ? (
                            <><Headset className="h-3 w-3" /> Vos</>
                          ) : (
                            <><Bot className="h-3 w-3" /> Agente IA</>
                          )}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          delVecino
                            ? 'text-muted-foreground'
                            : m.role === 'admin'
                              ? 'text-white/70'
                              : 'text-primary-foreground/70',
                        )}
                      >
                        {formatDate(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </CardContent>

          {/* Compositor: solo con el modo humano activo */}
          {humano && (
            <div className="border-t p-4 space-y-2">
              {conversation && !conversation.window_open && (
                <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <Clock className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    Pasaron más de 24 h desde el último mensaje del vecino. WhatsApp no permite
                    escribir texto libre fuera de esa ventana hasta que él vuelva a escribir.
                  </span>
                </p>
              )}

              <form onSubmit={handleSend} className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter envía, Shift+Enter hace salto de línea
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder={
                    conversation?.window_open
                      ? 'Escribí tu respuesta…'
                      : 'Ventana de 24 h cerrada'
                  }
                  disabled={sending || !conversation?.window_open}
                  rows={2}
                  maxLength={1500}
                  className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || !draft.trim() || !conversation?.window_open}
                  aria-label="Enviar mensaje"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          )}
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
