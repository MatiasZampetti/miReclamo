-- ============================================
-- 003: Toma de control humana de la conversación
-- ============================================

-- --------------------------------------------
-- MESSAGES: distinguir al admin del agente IA
-- --------------------------------------------
-- Hasta ahora role solo admitía 'user' | 'assistant'. Los mensajes escritos
-- a mano por un administrador necesitan su propio rol para poder mostrarlos
-- distinto en el panel y para no confundirlos con respuestas de la IA.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check
  CHECK (role IN ('user', 'assistant', 'admin'));

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES admin_users(id);

-- --------------------------------------------
-- CONVERSATION_MODES: quién atiende cada teléfono
-- --------------------------------------------
-- La clave es (tenant_id, phone_number) y NO session_id: cuando se guarda un
-- reclamo la sesión pasa a 'completed', y si el vecino vuelve a escribir se
-- crea una sesión nueva. El webhook solo conoce el teléfono, así que el modo
-- tiene que poder resolverse a partir de ese dato.
CREATE TABLE IF NOT EXISTS conversation_modes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number   TEXT NOT NULL,

  mode           TEXT NOT NULL DEFAULT 'agent' CHECK (mode IN ('agent', 'human')),

  -- Hilo al que se agregan los mensajes mientras dura la toma de control.
  -- Es la sesión del reclamo desde el que el admin tomó la conversación, para
  -- que el intercambio siga viéndose en ese mismo chat.
  session_id     UUID REFERENCES sessions(id) ON DELETE SET NULL,
  complaint_id   UUID REFERENCES complaints(id) ON DELETE SET NULL,

  taken_over_by  UUID REFERENCES admin_users(id),
  taken_over_at  TIMESTAMPTZ,
  released_at    TIMESTAMPTZ,

  -- Último mensaje entrante del vecino. WhatsApp solo permite mensajes libres
  -- dentro de las 24 h posteriores; pasado ese plazo hace falta una plantilla
  -- aprobada. Guardarlo permite avisarle al admin antes de que falle el envío.
  last_inbound_at TIMESTAMPTZ,

  updated_at     TIMESTAMPTZ DEFAULT now(),

  UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_conversation_modes_lookup
  ON conversation_modes (tenant_id, phone_number);

-- CREATE OR REPLACE para que la migración se pueda correr más de una vez
CREATE OR REPLACE TRIGGER conversation_modes_updated_at
  BEFORE UPDATE ON conversation_modes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
