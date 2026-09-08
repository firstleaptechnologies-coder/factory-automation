'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Sheet, WheelOption, WheelPicker } from '@/ui';

export interface FilterDimension {
  /** Matches the key in the value map handed back on apply. */
  key: string;
  label: string;
  options: WheelOption[];
}

/**
 * The one filter UI, everywhere.
 *
 * Every filterable list in the product opens this: a wheel per dimension, set
 * one after another, then applied in a single go. Nothing is filtered until
 * Apply is pressed, so a list does not thrash and re-fetch while somebody is
 * still deciding — and there is an obvious way to back out having changed
 * nothing.
 */
export function FilterSheet({
  open,
  onClose,
  dimensions,
  value,
  onApply,
  title = 'Filter',
}: {
  open: boolean;
  onClose: () => void;
  dimensions: FilterDimension[];
  value: Record<string, string | null>;
  onApply: (next: Record<string, string | null>) => void;
  title?: string;
}) {
  const [draft, setDraft] = useState(value);

  /*
   * Reopening shows what is actually applied, not whatever was abandoned last
   * time the sheet was dismissed — but only on the way in.
   *
   * Every caller passes `value` as an object literal, so its identity changes
   * on each render of the list behind the sheet. Reacting to that identity put
   * the applied filters back over whatever had just been chosen, every render.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setDraft(value);
    wasOpen.current = open;
  }, [open, value]);

  const active = dimensions.filter((d) => draft[d.key]).length;
  const cleared = Object.fromEntries(dimensions.map((d) => [d.key, null]));

  return (
    <Sheet
      open={open}
      title={title}
      subtitle={
        active === 0
          ? 'Nothing filtered yet'
          : `${active} filter${active === 1 ? '' : 's'} ready to apply`
      }
      onClose={onClose}>
      <div className="stack-lg">
        {dimensions.map((dimension) => (
          <WheelPicker
            key={dimension.key}
            label={dimension.label}
            options={dimension.options}
            value={draft[dimension.key] ?? null}
            onChange={(id) => setDraft((current) => ({ ...current, [dimension.key]: id }))}
          />
        ))}
      </div>

      <p className="t-tiny faint" style={{ textAlign: 'center', margin: 'var(--s-lg) 0' }}>
        Spin each wheel to the value you want, then apply them together.
      </p>

      <Button
        title={active === 0 ? 'Show everything' : `Apply ${active} filter${active === 1 ? '' : 's'}`}
        size="lg"
        block
        onClick={() => {
          onApply(draft);
          onClose();
        }}
      />
      {active > 0 ? (
        <div style={{ marginTop: 'var(--s-sm)' }}>
          <Button
            title="Clear all"
            variant="ghost"
            block
            onClick={() => {
              setDraft(cleared);
              onApply(cleared);
              onClose();
            }}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
