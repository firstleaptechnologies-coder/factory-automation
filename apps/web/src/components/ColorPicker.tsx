'use client';

import { useRef, useState } from 'react';
import { hexToHsl, hslToHex, inkOn, normalizeHex } from '@decor/shared';
import { Field } from '@/ui';

/** A few to start from. Any colour at all is a slider away. */
export const PRESETS = [
  '#6B7785',
  '#2F81F7',
  '#D6F55B',
  '#D29922',
  '#8957E5',
  '#2EA043',
  '#DA3633',
];

/** The hue wheel, laid flat. */
const HUES = [0, 60, 120, 180, 240, 300, 360].map((h) => hslToHex({ h, s: 100, l: 50 }));

type Track = 'hue' | 'saturation' | 'lightness';

/**
 * Picking a colour, any colour.
 *
 * Seven swatches were enough while the stages were ours; they are not enough
 * for a shop that has its own idea of what "Polishing" looks like, or wants its
 * own orange. So the swatches stay as a starting point and the three sliders
 * underneath reach the rest of the wheel.
 *
 * Ours rather than `<input type="color">`, and the same three tracks as the
 * app's: the system picker looks and behaves differently on every machine, and
 * a colour chosen on a phone and a colour chosen at the desk should be the same
 * job. The preview writes real words in the ink the product will actually use,
 * because the question is not "is it nice" but "can the shop read its labels".
 */
export function ColorPicker({
  value,
  onChange,
  label = 'Colour',
  presets = PRESETS,
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  /** Somewhere to start. A stage and a brand colour start from different places. */
  presets?: string[];
}) {
  const clean = normalizeHex(value) ?? '#6B7785';
  const hsl = hexToHsl(clean);
  const [typed, setTyped] = useState<string | null>(null);

  const set = (next: Partial<{ h: number; s: number; l: number }>) => {
    setTyped(null);
    onChange(hslToHex({ ...hsl, ...next }));
  };

  const ink = inkOn(clean);

  return (
    <div className="stack-sm">
      <span className="field-label">{label}</span>

      {/* What it will actually look like, in the ink that will actually be
          used on it. */}
      <div className="colour-preview" data-testid="colour-preview" style={{ background: value }}>
        <span className="t-body bold" style={{ color: ink }}>
          Sample stage
        </span>
        <span className="t-tiny" style={{ color: ink, opacity: 0.75 }}>
          {clean}
        </span>
      </div>

      <div className="chip-row">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="colour-preset"
            data-testid={`preset-${preset}`}
            aria-label={`Colour ${preset}`}
            aria-pressed={normalizeHex(value) === preset}
            data-on={normalizeHex(value) === preset}
            style={{ background: preset }}
            onClick={() => {
              setTyped(null);
              onChange(preset);
            }}
          />
        ))}
      </div>

      <Slider
        track="hue"
        label="Hue"
        value={hsl.h}
        max={360}
        stops={HUES}
        onChange={(h) => set({ h })}
      />
      <Slider
        track="saturation"
        label="Saturation"
        value={hsl.s}
        max={100}
        stops={[hslToHex({ ...hsl, s: 0 }), hslToHex({ ...hsl, s: 100 })]}
        onChange={(s) => set({ s })}
      />
      <Slider
        track="lightness"
        label="Lightness"
        value={hsl.l}
        max={100}
        stops={[
          hslToHex({ ...hsl, l: 0 }),
          hslToHex({ ...hsl, l: 50 }),
          hslToHex({ ...hsl, l: 100 }),
        ]}
        onChange={(l) => set({ l })}
      />

      {/*
        Typed straight in, for a colour that came off a brand sheet. Kept as
        typed until it is a colour: rewriting half a hex while somebody is
        still typing it makes the field impossible to use.
      */}
      <Field
        label="Hex"
        placeholder="#2EA043"
        value={typed ?? clean}
        onChange={(next) => {
          setTyped(next.toUpperCase());
          const parsed = normalizeHex(next);
          if (parsed) onChange(parsed);
        }}
      />
    </div>
  );
}

/** One track: a band of the colours it can reach, and a thumb on it. */
function Slider({
  track,
  label,
  value,
  max,
  stops,
  onChange,
}: {
  track: Track;
  label: string;
  value: number;
  max: number;
  stops: string[];
  onChange: (value: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const at = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    const next = Math.round(Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * max);
    if (next !== value) onChange(next);
  };

  return (
    <div className="colour-slider">
      <div className="row">
        <span className="t-tiny faint">{label}</span>
        <div className="spacer" />
        <span className="t-tiny muted">{value}</span>
      </div>
      {/*
        A range input would be simplest, but it cannot show the colours it is
        choosing between — which is the whole point of the track.
      */}
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        data-testid={`colour-track-${track}`}
        className="colour-track"
        style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
          at(event.clientX);
        }}
        onPointerMove={(event) => dragging && at(event.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        // The keyboard reaches every value the pointer can, a step at a time.
        onKeyDown={(event) => {
          const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
          if (!step) return;
          event.preventDefault();
          onChange(Math.max(0, Math.min(max, value + step)));
        }}>
        <span
          data-testid={`colour-thumb-${track}`}
          className="colour-thumb"
          style={{ left: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );
}
