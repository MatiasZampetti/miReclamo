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
