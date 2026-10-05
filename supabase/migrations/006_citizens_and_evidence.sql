-- ============================================
-- 006: Vecinos identificados y evidencia del reclamo
-- ============================================
--
-- Ningun reclamo puede ser anonimo. El numero de WhatsApp ya esta verificado
-- (nadie escribe desde un numero que no tiene); lo que se agrega es QUIEN es:
-- nombre y DNI, pedidos una sola vez por numero.
--
-- La clave es (tenant_id, phone_number), igual que conversation_modes: es lo
-- unico que el webhook conoce cuando llega un mensaje de Twilio.
--
-- El DNI NO es unico: una familia puede compartir telefono y alguien puede
-- cambiar de numero. Un DNI en varios numeros se marca en el panel para que
-- lo revise un admin, no se bloquea.

CREATE TABLE IF NOT EXISTS citizens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  full_name    TEXT NOT NULL,
  dni          TEXT NOT NULL CHECK (dni ~ '^[0-9]{7,8}$'),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_citizens_dni ON citizens (tenant_id, dni);

ALTER TABLE citizens ENABLE ROW LEVEL SECURITY;

-- photos: rutas dentro del bucket privado "complaint-photos" de Storage.
-- no_photo_reason: por que el vecino no pudo mandar foto (ej. un ruido).
-- location_source: 'whatsapp_pin' si las coordenadas vienen de la ubicacion
-- compartida por WhatsApp (exactas), 'text' si se geocodifico la direccion.
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS citizen_id      UUID REFERENCES citizens(id),
  ADD COLUMN IF NOT EXISTS photos          TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS no_photo_reason TEXT,
  ADD COLUMN IF NOT EXISTS location_source TEXT CHECK (location_source IN ('text', 'whatsapp_pin'));

CREATE INDEX IF NOT EXISTS idx_complaints_citizen ON complaints (citizen_id);
