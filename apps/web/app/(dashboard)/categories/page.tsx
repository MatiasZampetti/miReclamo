'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { api, type Category, type Subcategory } from '@/lib/api-client';

export default function CategoriesPage() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? '';

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  const fetchCategories = async () => {
    if (!token) return;
    try {
      setError(null);
      const data = await api.categories.list(token);
      setCategories(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, [token]);

  async function createCategory() {
    if (!newCatName.trim() || !token) return;
    await api.categories.create({ name: newCatName, description: newCatDesc || undefined }, token);
    setNewCatName('');
    setNewCatDesc('');
    fetchCategories();
  }

  async function deleteCategory(id: string) {
    if (!confirm('¿Eliminar esta categoría?') || !token) return;
    try {
      await api.categories.delete(id, token);
      fetchCategories();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error');
    }
  }

  async function updateCategory(id: string) {
    if (!editCatName.trim() || !token) return;
    await api.categories.update(id, { name: editCatName }, token);
    setEditingCat(null);
    fetchCategories();
  }

  async function toggleCategoryActive(cat: Category) {
    if (!token) return;
    await api.categories.update(cat.id, { is_active: !cat.is_active }, token);
    fetchCategories();
  }

  async function createSubcategory(categoryId: string) {
    const name = newSubName[categoryId]?.trim();
    if (!name || !token) return;
    await api.categories.createSubcategory(categoryId, { name }, token);
    setNewSubName((prev) => ({ ...prev, [categoryId]: '' }));
    fetchCategories();
  }

  async function deleteSubcategory(categoryId: string, subId: string) {
    if (!confirm('¿Eliminar esta subcategoría?') || !token) return;
    await api.categories.deleteSubcategory(categoryId, subId, token);
    fetchCategories();
  }

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>;
  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-semibold mb-1">Error al cargar categorías</p>
        <p className="text-sm">{error}</p>
        <button onClick={fetchCategories} className="mt-3 text-sm underline hover:no-underline">Reintentar</button>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
        <p className="text-gray-500 text-sm mt-1">Configurá las categorías y subcategorías del agente IA</p>
      </div>

      {/* Crear categoría */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Nueva categoría</h2>
        <div className="flex gap-3">
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nombre (ej: Luminaria)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && createCategory()}
          />
          <input
            value={newCatDesc}
            onChange={(e) => setNewCatDesc(e.target.value)}
            placeholder="Descripción (opcional)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={createCategory}
            disabled={!newCatName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition"
          >
            Agregar
          </button>
        </div>
      </div>

      {/* Lista de categorías */}
      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 flex items-center gap-4">
              <div className="flex-1">
                {editingCat === cat.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && updateCategory(cat.id)}
                      autoFocus
                    />
                    <button
                      onClick={() => updateCategory(cat.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingCat(null)}
                      className="px-3 py-1.5 text-gray-600 text-sm rounded-lg border border-gray-300"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{cat.name}</span>
                    {!cat.is_active && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Inactiva</span>
                    )}
                    {cat.description && (
                      <span className="text-sm text-gray-500">{cat.description}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {(cat.subcategories ?? []).length} subcategorías
                </span>
                <button
                  onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition"
                >
                  {expandedCat === cat.id ? 'Cerrar' : 'Ver'}
                </button>
                <button
                  onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); }}
                  className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg transition"
                >
                  Editar
                </button>
                <button
                  onClick={() => toggleCategoryActive(cat)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition"
                >
                  {cat.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-lg transition"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {/* Subcategorías expandidas */}
            {expandedCat === cat.id && (
              <div className="px-6 pb-4 border-t border-gray-100">
                <div className="pt-4 space-y-2">
                  {(cat.subcategories ?? []).map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg">
                      <span className="flex-1 text-sm text-gray-700">{sub.name}</span>
                      <button
                        onClick={() => deleteSubcategory(cat.id, sub.id)}
                        className="text-xs text-red-500 hover:text-red-700 transition"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-2 mt-3">
                    <input
                      value={newSubName[cat.id] ?? ''}
                      onChange={(e) => setNewSubName((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                      placeholder="Nueva subcategoría..."
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && createSubcategory(cat.id)}
                    />
                    <button
                      onClick={() => createSubcategory(cat.id)}
                      disabled={!newSubName[cat.id]?.trim()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm rounded-lg transition"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
