import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { hexToHsl, hslToHex, inkOn, normalizeHex } from '@fas/shared';
import { palette, radius, spacing } from '../theme';
import { Field } from './Field';
import { Text } from './Text';
import { haptic } from './Button';

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
 * Hue, saturation and lightness rather than red, green and blue: nobody adjusts
 * a colour by thinking in red, and the three tracks each show what they are
 * about to do, so the choice is made by looking rather than by arithmetic.
 *
 * The preview writes real words in the ink the product will actually use on
 * this colour, because the question being answered is not "is it nice" but
 * "can the shop read its own labels".
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
  const hsl = hexToHsl(normalizeHex(value) ?? '#6B7785');
  const [typed, setTyped] = useState<string | null>(null);

  const set = (next: Partial<{ h: number; s: number; l: number }>) => {
    setTyped(null);
    onChange(hslToHex({ ...hsl, ...next }));
  };

  const ink = inkOn(normalizeHex(value) ?? '#6B7785');

  return (
    <View>
      <Text variant="label" tone="muted" style={styles.label}>{label}</Text>

      {/* What it will actually look like, in the ink that will actually be
          used on it. */}
      <View testID="colour-preview" style={[styles.preview, { backgroundColor: value }]}>
        <Text variant="body" bold style={{ color: ink }}>
          Sample stage
        </Text>
        <Text variant="tiny" style={{ color: ink, opacity: 0.75 }}>
          {normalizeHex(value) ?? value}
        </Text>
      </View>

      <View style={styles.presets}>
        {/* Pressable, so a touch that merely ends here does not change the
            colour. */}
        {presets.map((preset) => (
          <Pressable
            key={preset}
            testID={`preset-${preset}`}
            accessibilityRole="button"
            accessibilityLabel={`Colour ${preset}`}
            accessibilityState={{ selected: normalizeHex(value) === preset }}
            onPress={() => {
              haptic('impactLight');
              setTyped(null);
              onChange(preset);
            }}
            style={[
              styles.preset,
              { backgroundColor: preset },
              normalizeHex(value) === preset && styles.presetOn,
            ]}
          />
        ))}
      </View>

      <Slider
        track="hue"
        label="Hue"
        value={hsl.h}
        max={360}
        colors={HUES}
        onChange={(h) => set({ h })}
      />
      <Slider
        track="saturation"
        label="Saturation"
        value={hsl.s}
        max={100}
        colors={[hslToHex({ ...hsl, s: 0 }), hslToHex({ ...hsl, s: 100 })]}
        onChange={(s) => set({ s })}
      />
      <Slider
        track="lightness"
        label="Lightness"
        value={hsl.l}
        max={100}
        colors={[
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
        autoCapitalize="characters"
        value={typed ?? normalizeHex(value) ?? value}
        onChangeText={(next) => {
          // Upper-cased as it goes in, which changes nothing about what was
          // typed — unlike rewriting a half-finished hex, which does.
          setTyped(next.toUpperCase());
          const clean = normalizeHex(next);
          if (clean) onChange(clean);
        }}
      />
    </View>
  );
}

/** One track: a band of the colours it can reach, and a thumb on it. */
function Slider({
  track,
  label,
  value,
  max,
  colors,
  onChange,
}: {
  track: Track;
  label: string;
  value: number;
  max: number;
  colors: string[];
  onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(0);

  const at = (x: number) => {
    if (!width) return;
    const next = Math.round(Math.max(0, Math.min(1, x / width)) * max);
    if (next !== value) onChange(next);
  };

  const pan = Gesture.Pan()
    .withTestId(`colour-${track}`)
    .minDistance(0)
    .onBegin((event) => runOnJS(at)(event.x))
    .onUpdate((event) => runOnJS(at)(event.x));

  const thumbAt = width ? (value / max) * width : 0;

  return (
    <View style={styles.slider}>
      <View style={styles.sliderHead}>
        <Text variant="tiny" tone="faint">{label}</Text>
        <Text variant="tiny" tone="muted">{value}</Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          testID={`colour-track-${track}`}
          style={styles.track}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.trackFill}
          />
          <View
            testID={`colour-thumb-${track}`}
            pointerEvents="none"
            style={[styles.thumb, { left: Math.max(0, thumbAt - THUMB / 2) }]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const TRACK_HEIGHT = 26;
const THUMB = 22;

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  preview: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preset: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetOn: { borderColor: palette.text },
  slider: { marginTop: spacing.lg },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  track: { height: TRACK_HEIGHT, justifyContent: 'center' },
  trackFill: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: palette.white,
    // Reads as a bead on the track rather than a hole in it.
    backgroundColor: 'transparent',
  },
});
