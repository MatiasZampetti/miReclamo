-- ============================================
-- 005: Bloqueo de numeros por mensajes fuera de tema
-- ============================================
--
-- Se agregan a conversation_modes porque esa tabla ya es el estado por
-- telefono (tenant_id, phone_number), que es la unica clave que el webhook
-- conoce cuando llega un mensaje de Twilio.
--
-- offtopic_strikes cuenta SOLO mensajes sin relacion con el municipio.
-- Un reclamo real dirigido a otro organismo (policia, vialidad) NO suma:
-- esa persona actua de buena fe, solo se equivoco de canal.

ALTER TABLE conversation_modes
  ADD COLUMN IF NOT EXISTS offtopic_strikes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_offtopic_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warned_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason   TEXT,
  ADD COLUMN IF NOT EXISTS unblocked_by     UUID REFERENCES admin_users(id);

-- El webhook consulta el bloqueo en cada mensaje entrante
CREATE INDEX IF NOT EXISTS idx_conversation_modes_blocked
  ON conversation_modes (tenant_id, phone_number)
  WHERE blocked_at IS NOT NULL;
