/** Display helpers shared by both clients so numbers read the same everywhere. */

export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatArea(value: number | string | null | undefined): string {
  return `${Number(value ?? 0).toFixed(2)} m²`;
}

export function formatMm(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return n ? `${Math.round(n)} mm` : '—';
}

export function formatSheetSize(
  lengthMm: number | string | null | undefined,
  widthMm: number | string | null | undefined,
): string {
  const l = Number(lengthMm ?? 0);
  const w = Number(widthMm ?? 0);
  return l && w ? `${Math.round(l)} × ${Math.round(w)} mm` : '—';
}

export function formatDuration(minutes: number | null | undefined): string {
  const m = Math.max(Math.round(minutes ?? 0), 0);
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Days until a due date; negative means overdue. */
export function daysUntil(due: string | Date | null | undefined): number | null {
  if (!due) return null;
  const date = typeof due === 'string' ? new Date(due) : due;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((date.getTime() - startOfToday.getTime()) / 86_400_000);
}
