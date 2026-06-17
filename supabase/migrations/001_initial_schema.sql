-- ============================================
-- TENANTS (base multi-tenant)
-- ============================================
CREATE TABLE tenants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  whatsapp_number  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ADMIN USERS
-- ============================================
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CATEGORIES (configurables por tenant)
-- ============================================
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- ============================================
-- SUBCATEGORIES
-- ============================================
CREATE TABLE subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, name)
);

-- ============================================
-- SESSIONS (estado de conversación WhatsApp)
-- ============================================
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  context      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours')
);

-- Solo una sesión activa por usuario por tenant
CREATE UNIQUE INDEX idx_sessions_active ON sessions(tenant_id, phone_number)
  WHERE status = 'active';

-- ============================================
-- MESSAGES (historial de chat)
-- ============================================
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- COMPLAINTS (reclamos finalizados)
-- ============================================
CREATE TABLE complaints (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id         UUID REFERENCES sessions(id),
  category_id        UUID NOT NULL REFERENCES categories(id),
  subcategory_id     UUID REFERENCES subcategories(id),

  phone_number       TEXT NOT NULL,
  complainant_name   TEXT,

  description        TEXT NOT NULL,
  location           TEXT,
  summary            TEXT NOT NULL,

  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
  status_note        TEXT,

  ai_confidence      FLOAT CHECK (ai_confidence BETWEEN 0 AND 1),
  raw_classification JSONB,

  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_sessions_phone       ON sessions(tenant_id, phone_number);
CREATE INDEX idx_complaints_status    ON complaints(tenant_id, status);
CREATE INDEX idx_complaints_category  ON complaints(tenant_id, category_id);
CREATE INDEX idx_complaints_date      ON complaints(created_at DESC);
CREATE INDEX idx_messages_session     ON messages(session_id, created_at);

-- ============================================
-- UPDATED_AT automático
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
