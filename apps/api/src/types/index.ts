export type ComplaintStatus = 'pending' | 'in_progress' | 'resolved' | 'rejected';
export type UrgencyLevel = 'high' | 'medium' | 'low';
export type MessageRole = 'user' | 'assistant' | 'admin';
export type ConversationMode = 'agent' | 'human';

export interface ConversationModeRow {
  id: string;
  tenant_id: string;
  phone_number: string;
  mode: ConversationMode;
  session_id: string | null;
  complaint_id: string | null;
  taken_over_by: string | null;
  taken_over_at: string | null;
  released_at: string | null;
  last_inbound_at: string | null;
  offtopic_strikes: number;
  last_offtopic_at: string | null;
  warned_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  unblocked_by: string | null;
  updated_at: string;
}
export type GeocodeStatus = 'pending' | 'ok' | 'not_found' | 'error';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type ConversationState = 'greeting' | 'collecting' | 'confirming' | 'completed';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  whatsapp_number: string | null;
  city: string | null;
  center_lat: number | null;
  center_lng: number | null;
  default_zoom: number | null;
  created_at: string;
}

export interface AdminUser {
  id: string;
  tenant_id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'superadmin';
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
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface SessionContext {
  state: ConversationState;
  collected: {
    description?: string;
    category_id?: string;
    subcategory_id?: string;
    location?: string;
    complainant_name?: string;
  };
  missing_fields: string[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  attempts: number;
}

export interface Session {
  id: string;
  tenant_id: string;
  phone_number: string;
  status: SessionStatus;
  context: SessionContext;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  tenant_id: string;
  role: MessageRole;
  content: string;
  sent_by: string | null;
  created_at: string;
}

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
  status: ComplaintStatus;
  status_note: string | null;
  urgency: UrgencyLevel | null;
  urgency_source: 'ai' | 'manual' | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: GeocodeStatus | null;
  geocoded_label: string | null;
  geocoded_at: string | null;
  ai_confidence: number | null;
  raw_classification: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  category?: Category;
  subcategory?: Subcategory;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenant_id: string;
  role: string;
}
