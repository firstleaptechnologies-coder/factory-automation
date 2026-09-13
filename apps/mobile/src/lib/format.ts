/**
 * The role in the shop's own words.
 *
 * A tenant can rename its roles — "Production" becomes "Karigar" — and the two
 * places that tell somebody who they are were showing the enum underneath, so
 * the app called them something nobody in the shop says. The browser already
 * showed the renamed one.
 *
 * Display only: gating reads permissions and never this.
 */
export function roleLabel(
  user: { role?: string | null; roleName?: string | null } | null | undefined,
): string | undefined {
  return user?.roleName ?? user?.role ?? undefined;
}

/** Somebody's code and role, as one line, with neither half faked when absent. */
export function whoLabel(
  user: { code?: string | null; role?: string | null; roleName?: string | null } | null | undefined,
): string {
  return [user?.code, roleLabel(user)].filter(Boolean).join(' · ');
}

/** Rupees, shortened so a large figure still fits a phone card. */
export function formatInr(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(date);
}
