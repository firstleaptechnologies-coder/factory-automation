'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  color?: string | null;
}

/**
 * A select we own.
 *
 * The native control cannot be themed — it draws the operating system's own
 * popup, in the operating system's own colours, which on a dark soft-UI page
 * looks like a hole punched through to a different application. This is the
 * same shape as every other field here and behaves the same on every platform.
 *
 * It is a button plus a list rather than a `<select>`, so keyboard use is
 * implemented deliberately: arrows move the highlight, Enter and Space commit,
 * Escape closes without changing anything.
 */
export function Select({
  label,
  hint,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  style,
}: {
  label?: string;
  hint?: string;
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));

    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, options, value]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div className="field" style={style} ref={wrap}>
      {label ? <span className="field-label">{label}</span> : null}
      <div className="select">
        <button
          type="button"
          className="select-trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}>
          {selected?.color ? (
            <span className="select-dot" style={{ background: selected.color }} />
          ) : null}
          <span className={selected ? 'truncate' : 'truncate faint'}>
            {selected?.label ?? placeholder}
          </span>
          <Icon name="chevronDown" size={16} color="var(--text-muted)" />
        </button>

        {open ? (
          <div
            className="select-list"
            role="listbox"
            tabIndex={-1}
            ref={(node) => node?.focus()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') return setOpen(false);
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current) => Math.min(current + 1, options.length - 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current) => Math.max(current - 1, 0));
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                commit(active);
              }
            }}>
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className="select-option"
                data-active={index === active}
                data-selected={option.value === value}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(index)}>
                {option.color ? (
                  <span className="select-dot" style={{ background: option.color }} />
                ) : null}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="truncate" style={{ display: 'block' }}>
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="t-tiny faint">{option.description}</span>
                  ) : null}
                </span>
                {option.value === value ? (
                  <Icon name="check" size={15} color="var(--accent)" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
