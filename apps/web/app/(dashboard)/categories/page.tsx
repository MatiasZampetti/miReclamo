'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { api, type Category } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

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

  if (loading) return (
    <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );

  if (error) return (
    <div className="p-8">
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-6 text-destructive">
          <p className="font-semibold mb-1">Error al cargar categorías</p>
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchCategories} className="mt-3">Reintentar</Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted-foreground mt-1">Configurá las categorías y subcategorías del agente IA</p>
      </div>

      {/* Crear categoría */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Nueva categoría</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nombre (ej: Luminaria)"
              className="flex-1 min-w-[180px]"
              onKeyDown={(e) => e.key === 'Enter' && createCategory()}
            />
            <Input
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              className="flex-1 min-w-[180px]"
            />
            <Button onClick={createCategory} disabled={!newCatName.trim()} className="gap-1">
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-4">
        {categories.map((cat) => (
          <Card key={cat.id}>
            <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                {editingCat === cat.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && updateCategory(cat.id)}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => updateCategory(cat.id)}>Guardar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingCat(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium">{cat.name}</span>
                    {!cat.is_active && <Badge variant="secondary">Inactiva</Badge>}
                    {cat.description && <span className="text-sm text-muted-foreground">{cat.description}</span>}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {(cat.subcategories ?? []).length} subcategorías
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                  className="gap-1"
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', expandedCat === cat.id && 'rotate-180')} />
                  {expandedCat === cat.id ? 'Cerrar' : 'Ver'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); }} className="gap-1">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleCategoryActive(cat)}>
                  {cat.is_active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteCategory(cat.id)}
                  className="gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </div>

            {/* Subcategorías */}
            {expandedCat === cat.id && (
              <div className="px-6 pb-4 border-t">
                <div className="pt-4 space-y-2">
                  {(cat.subcategories ?? []).map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 py-2 px-3 bg-muted/50 rounded-lg">
                      <span className="flex-1 text-sm">{sub.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSubcategory(cat.id, sub.id)}
                        className="h-7 text-xs text-destructive hover:text-destructive"
                      >
                        Eliminar
                      </Button>
                    </div>
                  ))}

                  <div className="flex gap-2 mt-3">
                    <Input
                      value={newSubName[cat.id] ?? ''}
                      onChange={(e) => setNewSubName((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                      placeholder="Nueva subcategoría..."
                      onKeyDown={(e) => e.key === 'Enter' && createSubcategory(cat.id)}
                    />
                    <Button size="sm" onClick={() => createSubcategory(cat.id)} disabled={!newSubName[cat.id]?.trim()} className="gap-1">
                      <Plus className="h-4 w-4" /> Agregar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
