import React from 'react';
import { StyleSheet, Text as RNText, TextProps, TextStyle } from 'react-native';
import { font, palette, weight } from '../theme';

type Variant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'small'
  | 'tiny'
  | 'micro'
  | 'label';
type Tone =
  | 'default'
  | 'muted'
  | 'faint'
  | 'onAccent'
  | 'accent'
  | 'danger'
  | 'success'
  | 'warning';

/**
 * One text component so type stays consistent. `label` is the small tracked
 * uppercase used for section headings throughout the app.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  bold,
  style,
  children,
  ...rest
}: TextProps & {
  variant?: Variant;
  tone?: Tone;
  bold?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <RNText
      {...rest}
      style={[
        styles[variant],
        toneStyles[tone],
        bold ? { fontWeight: weight.bold as TextStyle['fontWeight'] } : null,
        style,
      ]}>
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  display: { fontSize: font.display, fontWeight: '800', letterSpacing: -1.2 },
  h1: { fontSize: font.h1, fontWeight: '800', letterSpacing: -0.6 },
  h2: { fontSize: font.h2, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: font.h3, fontWeight: '700' },
  body: { fontSize: font.body, fontWeight: '500' },
  small: { fontSize: font.small, fontWeight: '500' },
  tiny: { fontSize: font.tiny, fontWeight: '600' },
  micro: { fontSize: font.micro, fontWeight: '600' },
  label: {
    fontSize: font.micro,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
});

const toneStyles = StyleSheet.create({
  default: { color: palette.text },
  muted: { color: palette.textMuted },
  faint: { color: palette.textFaint },
  onAccent: { color: palette.textOnAccent },
  accent: { color: palette.accent },
  danger: { color: palette.danger },
  success: { color: palette.success },
  warning: { color: palette.warning },
});
