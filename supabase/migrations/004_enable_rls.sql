-- ============================================
-- 004: Habilitar Row Level Security en todas las tablas
-- ============================================
--
-- Se habilita RLS SIN policies a propósito: eso deniega todo acceso a los
-- roles `anon` y `authenticated`, que son los que quedan expuestos con la
-- clave pública del proyecto.
--
-- La app no se ve afectada: apps/api se conecta con SUPABASE_SERVICE_KEY y
-- el rol `service_role` saltea RLS por diseño. El frontend nunca habla con
-- Supabase directo, siempre pasa por la API de Fastify.
--
-- Si en el futuro el navegador necesitara leer Supabase directamente, ahí sí
-- habría que escribir policies por tenant. Hoy no hace falta.

ALTER TABLE tenants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_modes ENABLE ROW LEVEL SECURITY;

-- Verificación: todas deberían quedar en rowsecurity = true
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
