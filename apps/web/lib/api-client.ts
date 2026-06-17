const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
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
export interface Complaint {
  id: string;
  tenant_id: string;
  session_id: string | null;
  category_id: string;
  subcategory_id: string | null;
  phone_number: string;
  complainant_name: string | null;
  description: string;
  location: string | null;
  summary: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
  status_note: string | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string };
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
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
