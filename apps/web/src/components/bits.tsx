'use client';

const STATUS_COLORS: Record<string, string> = {
  RUNNING: 'var(--success)',
  COMPLETED: 'var(--success)',
  DELIVERED: 'var(--success)',
  READY: 'var(--success)',
  IDLE: 'var(--text-muted)',
  PLANNED: 'var(--text-muted)',
  DRAFT: 'var(--text-muted)',
  PENDING: 'var(--text-muted)',
  QUEUED: 'var(--primary)',
  CONFIRMED: 'var(--primary)',
  IN_PRODUCTION: 'var(--primary)',
  SETUP: 'var(--warning)',
  PAUSED: 'var(--warning)',
  ON_HOLD: 'var(--warning)',
  MAINTENANCE: 'var(--warning)',
  BREAKDOWN: 'var(--danger)',
  CANCELLED: 'var(--danger)',
};

export function Pill({status}: {status: string}) {
  return (
    <span
      className="pill"
      style={{background: STATUS_COLORS[status] ?? 'var(--text-muted)'}}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'warning' | 'danger' | 'success';
}) {
  return (
    <div className="card">
      <div className={`stat-value${tone ? ` ${tone}` : ''}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Bar({pct, tone}: {pct: number; tone?: string}) {
  return (
    <div className="bar-track">
      <div
        className="bar-fill"
        style={{
          width: `${Math.min(Math.max(pct, 0), 100)}%`,
          background: tone ?? 'var(--primary)',
        }}
      />
    </div>
  );
}

export function ErrorBox({message}: {message: string | null}) {
  if (!message) return null;
  return <p className="error">{message}</p>;
}
