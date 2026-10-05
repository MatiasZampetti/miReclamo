const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    // Solo se declara el content-type si realmente va un cuerpo: Fastify
    // rechaza con 400 (FST_ERR_CTP_EMPTY_JSON_BODY) un POST que anuncia JSON
    // pero llega vacío, como takeover/release/geocode.
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Error desconocido');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface ComplaintFilters {
  status?: string;
  category_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface MapFilters {
  status?: string;
  category_id?: string;
  urgency?: string;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ token: string; user: { id: string; email: string; name: string; role: string; tenant_id: string } }>(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      ),
  },
  complaints: {
    list: (filters: ComplaintFilters, token: string) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.category_id) params.set('category_id', filters.category_id);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      return apiFetch<PaginatedResponse<Complaint>>(`/api/complaints?${params}`, { token });
    },
    get: (id: string, token: string) =>
      apiFetch<Complaint>(`/api/complaints/${id}`, { token }),
    getMessages: (id: string, token: string) =>
      apiFetch<Message[]>(`/api/complaints/${id}/messages`, { token }),
    updateStatus: (id: string, status: string, note: string | undefined, token: string) =>
      apiFetch<Complaint>(`/api/complaints/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, status_note: note }),
        token,
      }),
    map: (filters: MapFilters, token: string) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.category_id) params.set('category_id', filters.category_id);
      if (filters.urgency) params.set('urgency', filters.urgency);
      return apiFetch<MapResponse>(`/api/complaints/map?${params}`, { token });
    },
    updateUrgency: (id: string, urgency: string, token: string) =>
      apiFetch<Complaint>(`/api/complaints/${id}/urgency`, {
        method: 'PATCH',
        body: JSON.stringify({ urgency }),
        token,
      }),
    geocode: (id: string, token: string) =>
      apiFetch<Complaint>(`/api/complaints/${id}/geocode`, { method: 'POST', token }),
    conversation: (id: string, token: string) =>
      apiFetch<ConversationState>(`/api/complaints/${id}/conversation`, { token }),
    takeover: (id: string, token: string) =>
      apiFetch<ConversationState>(`/api/complaints/${id}/takeover`, { method: 'POST', token }),
    release: (id: string, token: string) =>
      apiFetch<ConversationState>(`/api/complaints/${id}/release`, { method: 'POST', token }),
    unblock: (id: string, token: string) =>
      apiFetch<ConversationState>(`/api/complaints/${id}/unblock`, { method: 'POST', token }),
    reply: (id: string, content: string, token: string) =>
      apiFetch<{ ok: true; sent_at: string }>(`/api/complaints/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ content }),
        token,
      }),
  },
  tenant: {
    mapConfig: (token: string) => apiFetch<MapConfig>('/api/tenant/map-config', { token }),
  },
  categories: {
    list: (token: string) =>
      apiFetch<Category[]>('/api/categories', { token }),
    create: (data: { name: string; description?: string }, token: string) =>
      apiFetch<Category>('/api/categories', { method: 'POST', body: JSON.stringify(data), token }),
    update: (id: string, data: Partial<Category>, token: string) =>
      apiFetch<Category>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
    delete: (id: string, token: string) =>
      apiFetch<void>(`/api/categories/${id}`, { method: 'DELETE', token }),
    createSubcategory: (categoryId: string, data: { name: string; description?: string }, token: string) =>
      apiFetch<Subcategory>(`/api/categories/${categoryId}/subcategories`, {
        method: 'POST', body: JSON.stringify(data), token,
      }),
    updateSubcategory: (categoryId: string, subId: string, data: Partial<Subcategory>, token: string) =>
      apiFetch<Subcategory>(`/api/categories/${categoryId}/subcategories/${subId}`, {
        method: 'PATCH', body: JSON.stringify(data), token,
      }),
    deleteSubcategory: (categoryId: string, subId: string, token: string) =>
      apiFetch<void>(`/api/categories/${categoryId}/subcategories/${subId}`, {
        method: 'DELETE', token,
      }),
  },
  stats: {
    summary: (token: string) =>
      apiFetch<StatsSummary>('/api/stats/summary', { token }),
    categories: (token: string) =>
      apiFetch<{ id: string; name: string; count: number }[]>('/api/stats/categories', { token }),
    timeline: (params: { from?: string; to?: string; group_by?: string }, token: string) => {
      const qs = new URLSearchParams(params as Record<string, string>);
      return apiFetch<{ date: string; count: number }[]>(`/api/stats/timeline?${qs}`, { token });
    },
  },
};

// Tipos compartidos con el frontend
export type UrgencyLevel = 'high' | 'medium' | 'low';
export type GeocodeStatus = 'pending' | 'ok' | 'not_found' | 'error';

/** Payload liviano que consume el mapa: solo lo que se dibuja y se muestra en el popup. */
export interface MapComplaint {
  id: string;
  summary: string;
  location: string | null;
  status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
  urgency: UrgencyLevel | null;
  latitude: number;
  longitude: number;
  created_at: string;
  complainant_name: string | null;
  category?: { id: string; name: string } | null;
}

export interface MapResponse {
  data: MapComplaint[];
  /** Reclamos que no se pudieron ubicar (sin dirección o sin geocodificar) */
  unmapped: number;
}

export interface MapConfig {
  city: string | null;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
}

export interface Complaint {
  id: string;
  tenant_id: string;
  session_id: string | null;
  category_id: string;
  subcategory_id: string | null;
  phone_number: string;
  complainant_name: string | null;
  citizen_id: string | null;
  description: string;
  location: string | null;
  /** 'whatsapp_pin': coordenadas exactas compartidas por el vecino */
  location_source: 'text' | 'whatsapp_pin' | null;
  photos: string[];
  /** Solo en el detalle: URLs firmadas (1 h) de las fotos del bucket privado */
  photo_urls?: string[];
  no_photo_reason: string | null;
  /** Solo en el detalle. null en reclamos anteriores al registro de vecinos */
  citizen?: ComplaintCitizen | null;
  summary: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
  status_note: string | null;
  urgency: UrgencyLevel | null;
  urgency_source: 'ai' | 'manual' | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: GeocodeStatus | null;
  geocoded_label: string | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string };
}

export interface ComplaintCitizen {
  id: string;
  full_name: string;
  dni: string;
  phone_number: string;
  created_at: string;
  /** Reclamos hechos por este vecino, incluido el actual */
  complaints_count: number;
  /** Otros números registrados con el mismo DNI: se muestra para revisión */
  dni_other_phones: string[];
}

export type MessageRole = 'user' | 'assistant' | 'admin';
export type ConversationMode = 'agent' | 'human';

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  sent_by: string | null;
  created_at: string;
}

export interface ConversationState {
  mode: ConversationMode;
  taken_over_by: string | null;
  taken_over_at: string | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  /** WhatsApp solo permite texto libre dentro de las 24 h del último entrante */
  window_open: boolean;
  /** Mensajes fuera de tema acumulados. Al llegar a 3 el número se bloquea. */
  offtopic_strikes: number;
  blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  subcategories?: Subcategory[];
}

export interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface StatsSummary {
  total: number;
  by_status: { pending: number; in_progress: number; resolved: number; rejected: number };
  resolution_time_avg_hours: number | null;
}
