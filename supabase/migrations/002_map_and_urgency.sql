-- ============================================
-- 002: Mapa de reclamos + grado de urgencia
-- ============================================

-- --------------------------------------------
-- TENANTS: centro del mapa y ciudad
-- --------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS center_lat   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS center_lng   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS default_zoom INTEGER DEFAULT 14;

-- Municipalidad de Villa del Rosario, Córdoba
-- Centro y bounding box obtenidos de OpenStreetMap (Nominatim, relation 7314771)
UPDATE tenants
SET city         = 'Villa del Rosario, Córdoba, Argentina',
    center_lat   = -31.5540883,
    center_lng   = -63.5352431,
    default_zoom = 14
WHERE id = '00000000-0000-0000-0000-000000000001';

-- --------------------------------------------
-- COMPLAINTS: urgencia + geolocalización
-- --------------------------------------------
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS urgency        TEXT
                             CHECK (urgency IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS urgency_source TEXT DEFAULT 'ai'
                             CHECK (urgency_source IN ('ai', 'manual')),
  ADD COLUMN IF NOT EXISTS latitude       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocode_status TEXT DEFAULT 'pending'
                             CHECK (geocode_status IN ('pending', 'ok', 'not_found', 'error')),
  ADD COLUMN IF NOT EXISTS geocoded_at    TIMESTAMPTZ,
  -- Dirección normalizada que devolvió el geocodificador (para auditar el match)
  ADD COLUMN IF NOT EXISTS geocoded_label TEXT;

-- Índice parcial: el mapa solo consulta reclamos que ya tienen coordenadas
CREATE INDEX IF NOT EXISTS idx_complaints_geo
  ON complaints (tenant_id, urgency)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Cola de geocodificación: reclamos con dirección pero sin coordenadas
CREATE INDEX IF NOT EXISTS idx_complaints_geocode_pending
  ON complaints (tenant_id)
  WHERE geocode_status = 'pending' AND location IS NOT NULL;
