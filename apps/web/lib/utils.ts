import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En proceso',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
};

export const URGENCY_LABELS: Record<string, string> = {
  high: 'Urgente',
  medium: 'Media',
  low: 'Baja',
};

export const URGENCY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  medium: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400',
  low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-500',
};

/**
 * Color literal de cada urgencia. Leaflet dibuja sobre <canvas>/SVG y no
 * entiende clases de Tailwind, así que los círculos del mapa necesitan el hex.
 */
export const URGENCY_HEX: Record<string, { fill: string; stroke: string }> = {
  high: { fill: '#dc2626', stroke: '#7f1d1d' },   // rojo
  medium: { fill: '#ea580c', stroke: '#7c2d12' }, // naranja
  low: { fill: '#eab308', stroke: '#713f12' },    // amarillo
};

export const URGENCY_FALLBACK = { fill: '#94a3b8', stroke: '#334155' }; // sin clasificar

// Color sólido (para barras de progreso, botones de acción, etc.)
export const STATUS_BAR_COLORS: Record<string, string> = {
  pending: 'bg-amber-500',
  in_progress: 'bg-blue-500',
  resolved: 'bg-emerald-500',
  rejected: 'bg-red-500',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
