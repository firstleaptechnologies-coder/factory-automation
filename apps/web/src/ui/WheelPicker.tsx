'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface WheelOption {
  id: string | null;
  label: string;
  /** A status or material colour, shown as a dot beside the label. */
  color?: string | null;
}

const ITEM_HEIGHT = 46;
/** Always odd, so exactly one row sits in the middle. */
const VISIBLE = 5;
const HEIGHT = ITEM_HEIGHT * VISIBLE;

/**
 * A scrolling wheel, matching the app's exactly.
 *
 * Written rather than borrowed from the platform so a filter looks and behaves
 * the same on an iPhone, on an Android and here — a native select on the web
 * and a wheel on the phone would be two different products.
 *
 * The centre row is the selection. Rows fade and shrink with distance from it,
 * which is what makes a flat list read as a wheel; padding half the wheel's
 * height above and below is what lets the first and last options reach the
 * middle.
 */
export function WheelPicker({
  options,
  value,
  onChange,
  label,
}: {
  options: WheelOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  // Guards the scroll-to-selection effect from fighting a wheel already moving;
  // without it, picking a value yanks the list back mid-scroll.
  const settling = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** -1 when the selected value is not among the options. */
  const index = options.findIndex((option) => option.id === value);

  useEffect(() => {
    if (settling.current || !ref.current) return;
    // A value that is not in the list — a material still loading, say — must
    // not be quietly rewritten to whatever happens to be first.
    if (index < 0) return;
    ref.current.scrollTop = index * ITEM_HEIGHT;
    setOffset(index * ITEM_HEIGHT);
  }, [index]);

  const settle = useCallback(() => {
    settling.current = false;
    const node = ref.current;
    if (!node) return;
    const next = Math.round(node.scrollTop / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(next, 0), options.length - 1);
    node.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' });
    const option = options[clamped];
    if (option && option.id !== value) onChange(option.id);
  }, [options, value, onChange]);

  const onScroll = () => {
    const node = ref.current;
    if (!node) return;
    settling.current = true;
    setOffset(node.scrollTop);
    // There is no scroll-end event, so a short quiet period stands in for one.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(settle, 110);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div>
      {label ? <span className="field-label">{label}</span> : null}
      <div className="wheel" style={{ height: HEIGHT }}>
        <div className="wheel-window" style={{ height: ITEM_HEIGHT }} />
        <div
          ref={ref}
          className="wheel-scroll"
          onScroll={onScroll}
          style={{ height: HEIGHT, paddingBlock: (HEIGHT - ITEM_HEIGHT) / 2 }}>
          {options.map((option, position) => {
            const distance = Math.abs(offset / ITEM_HEIGHT - position);
            const opacity = Math.max(0.14, 1 - distance * 0.58);
            const scale = Math.max(0.78, 1 - distance * 0.12);
            return (
              <button
                key={option.id ?? `any-${position}`}
                type="button"
                className="wheel-row"
                style={{ height: ITEM_HEIGHT, opacity, transform: `scale(${scale})` }}
                onClick={() => {
                  settling.current = false;
                  ref.current?.scrollTo({
                    top: position * ITEM_HEIGHT,
                    behavior: 'smooth',
                  });
                  if (option.id !== value) onChange(option.id);
                }}>
                {option.color ? (
                  <span className="wheel-dot" style={{ background: option.color }} />
                ) : null}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
