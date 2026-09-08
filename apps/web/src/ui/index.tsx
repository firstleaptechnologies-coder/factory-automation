'use client';

import React, { useEffect, useState } from 'react';
import { inkOn } from '@decor/shared';
import { Icon, IconName } from './Icon';

export { Icon };
export { WheelPicker } from './WheelPicker';
export { ImageViewer, ThumbImage } from './ImageViewer';
export type { ViewableImage } from './ImageViewer';
export { Select } from './Select';
export type { SelectOption } from './Select';
export type { WheelOption } from './WheelPicker';
export type { IconName };

/* -- surfaces -------------------------------------------------------------- */

export function Card({
  children,
  tone = 'raised',
  size,
  className = '',
  onClick,
  style,
}: {
  children: React.ReactNode;
  tone?: 'raised' | 'accent' | 'well';
  size?: 'sm';
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const classes = [
    tone === 'well' ? 'well' : 'card',
    tone === 'accent' ? 'card-accent' : '',
    size === 'sm' ? 'card-sm' : '',
    onClick ? 'card-link' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}

/* -- buttons --------------------------------------------------------------- */

export function Button({
  title,
  onClick,
  variant = 'primary',
  size,
  icon,
  loading,
  disabled,
  block,
  type = 'button',
  style,
}: {
  title: string;
  onClick?: () => void;
  variant?: 'primary' | 'dark' | 'ghost' | 'danger';
  size?: 'lg' | 'sm';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={style}
      className={[
        'btn',
        `btn-${variant}`,
        size ? `btn-${size}` : '',
        block ? 'btn-block' : '',
      ]
        .filter(Boolean)
        .join(' ')}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={17} /> : null}
      {loading ? null : title}
    </button>
  );
}

export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="chip" data-selected={selected} onClick={onClick}>
      {label}
    </button>
  );
}

export function Pill({ label, color }: { label: string; color: string }) {
  // Measured rather than hard-coded: status colours are configured per tenant,
  // and a dark label on a dark pill is unreadable — as is the reverse.
  return (
    <span className="pill" style={{ background: color, color: inkOn(color) }}>
      {label}
    </span>
  );
}

/* -- fields ---------------------------------------------------------------- */

/**
 * What is on the clipboard, when it looks like it belongs in this field.
 *
 * People fill this from WhatsApp — a number, a GST number, an address someone
 * sent over — and retyping is where the mistakes come from. Read only on focus,
 * because a browser will only hand over the clipboard in response to a gesture
 * anyway, and reading it unprompted would be the wrong thing to do regardless.
 */
function useClipboardOffer(accepts?: (text: string) => boolean) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const check = async () => {
    try {
      const text = (await navigator.clipboard?.readText())?.trim();
      if (!text || text.length > 200 || text === dismissed) return setSuggestion(null);
      if (accepts && !accepts(text)) return setSuggestion(null);
      setSuggestion(text);
    } catch {
      // No permission, or an insecure origin. The field simply gets no button.
      setSuggestion(null);
    }
  };

  return {
    suggestion,
    check,
    consume: () => {
      const value = suggestion;
      setDismissed(value);
      setSuggestion(null);
      return value;
    },
  };
}

export function Field({
  label,
  hint,
  error,
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  multiline,
  rows,
  autoFocus,
  disabled,
  pasteAccepts,
  pasteable = true,
  onEnter,
  style,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  rows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  pasteAccepts?: (text: string) => boolean;
  pasteable?: boolean;
  onEnter?: () => void;
  style?: React.CSSProperties;
}) {
  const clipboard = useClipboardOffer(pasteAccepts);
  const empty = !value;
  const showPaste = pasteable && empty && Boolean(clipboard.suggestion) && type !== 'password';

  const shared = {
    value,
    placeholder,
    autoFocus,
    disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    onFocus: () => {
      if (pasteable && type !== 'password') void clipboard.check();
    },
  };

  return (
    <label className="field" style={style}>
      {label ? <span className="field-label">{label}</span> : null}
      <div className={`field-well${error ? ' is-error' : ''}`}>
        {icon ? <Icon name={icon} size={17} color="var(--text-muted)" /> : null}
        {multiline ? (
          <textarea {...shared} rows={rows ?? 3} />
        ) : (
          <input
            {...shared}
            type={type}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onEnter) {
                e.preventDefault();
                onEnter();
              }
            }}
          />
        )}
        {showPaste ? (
          <button
            type="button"
            className="paste-btn"
            onClick={() => {
              const text = clipboard.consume();
              if (text) onChange(text);
            }}>
            <Icon name="clipboard" size={12} />
            Paste
          </button>
        ) : null}
      </div>
      {error ? (
        <span className="field-hint danger">{error}</span>
      ) : showPaste ? (
        <span className="field-hint truncate">On your clipboard: {clipboard.suggestion}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

/** Looks like a phone number someone would ring. */
export function looksLikePhone(text: string): boolean {
  const digits = text.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 13 && /^[\d+\-()\s]+$/.test(text);
}

/** Looks like a 15-character GSTIN. */
export function looksLikeGstin(text: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/i.test(text.replace(/\s/g, ''));
}

/** Long enough and varied enough to be an address rather than a stray word. */
export function looksLikeAddress(text: string): boolean {
  return text.length >= 12 && /\s/.test(text);
}

/* -- page furniture -------------------------------------------------------- */

export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="t-h1" style={{ margin: 0 }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="t-small muted" style={{ margin: '4px 0 0' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <span className="t-label muted">{title}</span>
      {action}
    </div>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <div className="loader">
      <span className="spinner" />
      {label ? <span className="t-small">{label}</span> : null}
    </div>
  );
}

export function EmptyState({
  icon = 'box',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Icon name={icon} size={26} />
      </div>
      <div className="t-h3">{title}</div>
      {message ? (
        <p className="t-small muted" style={{ maxWidth: 380, margin: '6px auto 0' }}>
          {message}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 'var(--s-lg)' }}>{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

/**
 * The end of a paged list. Without the "all N" half, a list that has genuinely
 * ended looks like one that failed to load more.
 */
export function ListFooter({
  loading,
  hasMore,
  shown,
  total,
  noun = 'items',
  onMore,
}: {
  loading: boolean;
  hasMore: boolean;
  shown: number;
  total: number;
  noun?: string;
  onMore?: () => void;
}) {
  if (shown === 0) return null;
  return (
    <div style={{ padding: 'var(--s-xl) 0', textAlign: 'center' }}>
      {loading ? (
        <span className="spinner" style={{ display: 'inline-block' }} />
      ) : hasMore ? (
        <Button title={`Show more (${shown} of ${total})`} variant="dark" size="sm" onClick={onMore} />
      ) : (
        <span className="t-tiny faint">
          All {total} {noun}
        </span>
      )}
    </div>
  );
}

/* -- sheet ----------------------------------------------------------------- */

export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-head">
          <div>
            {title ? (
              <div className="t-h2" style={{ margin: 0 }}>
                {title}
              </div>
            ) : null}
            {subtitle ? <div className="t-small muted">{subtitle}</div> : null}
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SheetOption({
  label,
  description,
  selected,
  accent,
  onClick,
}: {
  label: string;
  description?: string;
  selected?: boolean;
  accent?: string | null;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sheet-option" data-selected={selected} onClick={onClick}>
      {accent ? (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: accent,
            flex: 'none',
          }}
        />
      ) : null}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-body bold" style={{ display: 'block' }}>
          {label}
        </span>
        {description ? (
          <span className="t-tiny muted" style={{ display: 'block' }}>
            {description}
          </span>
        ) : null}
      </span>
      {selected ? <Icon name="check" size={17} color="var(--accent)" /> : null}
    </button>
  );
}
