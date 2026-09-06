'use client';

import { LENGTH_UNITS, LengthUnit, UNIT_LABEL, parseLengthToMm } from '@decor/shared';

/**
 * A dimension box that accepts what people actually type.
 *
 * The unit dropdown sets what a bare number means, but "8' 6" or "2440mm" or
 * "3/4in" are all understood regardless — the shop measures in whatever the
 * tape says, and making them normalise it by hand is where transcription
 * errors come from. Whatever is typed resolves to millimetres, shown below
 * the box so there is no doubt about what will be saved.
 */
export function SizeInput({
  label,
  value,
  unit,
  onChange,
  onUnitChange,
  placeholder,
}: {
  label: string;
  value: string;
  unit: LengthUnit;
  onChange: (value: string) => void;
  onUnitChange?: (unit: LengthUnit) => void;
  placeholder?: string;
}) {
  const mm = parseLengthToMm(value, unit);
  const invalid = value.trim().length > 0 && mm === null;

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={value}
          placeholder={placeholder ?? `e.g. 8 or 8' 6"`}
          onChange={(e) => onChange(e.target.value)}
          style={invalid ? { borderColor: 'var(--danger)' } : undefined}
        />
        {onUnitChange ? (
          <select
            value={unit}
            onChange={(e) => onUnitChange(e.target.value as LengthUnit)}
            style={{ width: 76 }}>
            {LENGTH_UNITS.map((u) => (
              <option key={u} value={u}>{UNIT_LABEL[u]}</option>
            ))}
          </select>
        ) : null}
      </div>
      <div style={{ fontSize: 11, marginTop: 3 }} className={invalid ? 'error' : 'muted'}>
        {invalid ? 'Not a size I can read' : mm !== null ? `= ${mm} mm stored` : ' '}
      </div>
    </div>
  );
}
