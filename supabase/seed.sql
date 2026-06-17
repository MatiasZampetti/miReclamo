-- ============================================
-- SEED INICIAL: Tenant + Admin + Categorías
-- ============================================

-- Tenant: Municipalidad
INSERT INTO tenants (id, name, slug, whatsapp_number)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Municipalidad',
  'municipalidad',
  NULL
);

-- Admin user: admin@mireclamo.com / admin123
-- Hash de 'admin123' con bcrypt (costo 10)
INSERT INTO admin_users (tenant_id, email, password_hash, name, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@mireclamo.com',
  '$2a$10$6JpggYmTdGcAun2TmqYnxOg0JuaWBf8JROWEYIhycgjuHKatpcNd2',
  'Administrador',
  'superadmin'
);

-- Categorías por defecto
INSERT INTO categories (id, tenant_id, name, description, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Luminaria', 'Problemas con el alumbrado público', 1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Limpieza', 'Residuos, basura y limpieza de espacios públicos', 2),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Baches y pavimento', 'Daños en calles, veredas y pavimento', 3),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Espacios verdes', 'Plazas, parques y áreas verdes', 4),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Tránsito', 'Señales, semáforos y problemas de tránsito', 5);

-- Subcategorías: Luminaria
INSERT INTO subcategories (tenant_id, category_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Poste apagado', 1),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Poste dañado', 2),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cables sueltos', 3);

-- Subcategorías: Limpieza
INSERT INTO subcategories (tenant_id, category_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Basura acumulada en vereda', 1),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Contenedor desbordado', 2),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Limpieza de zanjón', 3);

-- Subcategorías: Baches
INSERT INTO subcategories (tenant_id, category_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Bache en calzada', 1),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Vereda rota', 2);

-- Subcategorías: Espacios verdes
INSERT INTO subcategories (tenant_id, category_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Poda de árboles', 1),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Mantenimiento de plaza', 2);

-- Subcategorías: Tránsito
INSERT INTO subcategories (tenant_id, category_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Semáforo roto', 1),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Señal faltante', 2);
