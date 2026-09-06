import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { depth, gradients, palette, radius as R } from '../theme';

/**
 * A neumorphic surface.
 *
 * Two shadows make the effect: a light one up-left and a dark one down-right.
 * React Native allows only one shadow per view, so they are two nested views —
 * the outer casts the dark, the inner casts the light.
 *
 * The curvature gradient is painted as an absolutely-positioned layer *behind*
 * the children rather than as their container. A gradient that wraps the
 * content ends up measuring it, and anything relying on the content's natural
 * height gets clipped; a background layer takes no part in layout at all.
 *
 * `raised` looks pressed out of the background, `inset` pressed into it.
 * Nothing here has a visible border — on this theme a border flattens the
 * illusion immediately.
 */
export function Neumorph({
  children,
  variant = 'raised',
  radius = R.xl,
  size = 'md',
  style,
  contentStyle,
}: {
  children?: React.ReactNode;
  variant?: 'raised' | 'inset' | 'flat';
  radius?: number;
  size?: keyof typeof depth;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}) {
  const { offset, blur } = depth[size];

  if (variant === 'flat') {
    return (
      <View style={[{ borderRadius: radius, backgroundColor: palette.surface }, style]}>
        <View style={contentStyle}>{children}</View>
      </View>
    );
  }

  // An inner shadow does not exist in React Native, so a well is drawn as a
  // reversed gradient inside a dark rim: the top edge falls into shade and the
  // bottom edge catches light, which reads as depressed.
  if (variant === 'inset') {
    return (
      <View style={[styles.insetOuter, { borderRadius: radius }, style]}>
        <View style={[{ borderRadius: radius, overflow: 'hidden' }, contentStyle]}>
          <LinearGradient
            colors={gradients.inset}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius,
          shadowColor: '#000000',
          shadowOffset: { width: offset, height: offset },
          shadowOpacity: 0.55,
          shadowRadius: blur,
          elevation: 8,
        },
        style,
      ]}>
      <View
        style={{
          borderRadius: radius,
          shadowColor: '#FFFFFF',
          shadowOffset: { width: -offset, height: -offset },
          shadowOpacity: 0.06,
          shadowRadius: blur,
        }}>
        <View style={[{ borderRadius: radius, overflow: 'hidden' }, contentStyle]}>
          <LinearGradient
            colors={gradients.raised}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  insetOuter: {
    backgroundColor: palette.surfaceInset,
    // A hairline of near-black deepens the well without reading as a border.
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
  },
});

/**
 * The accent surface: a hot orange panel that throws a halo.
 *
 * The glow is a coloured drop shadow rather than a ring, which is what makes it
 * look like a light sitting on the panel instead of a sticker pasted to it.
 */
export function AccentSurface({
  children,
  radius = R.xl,
  style,
  contentStyle,
  soft,
}: {
  children?: React.ReactNode;
  radius?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  soft?: boolean;
}) {
  return (
    <View
      style={[
        {
          borderRadius: radius,
          shadowColor: palette.accent,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: soft ? 0.35 : 0.55,
          shadowRadius: soft ? 12 : 18,
          elevation: 12,
        },
        style,
      ]}>
      <View style={[{ borderRadius: radius, overflow: 'hidden' }, contentStyle]}>
        <LinearGradient
          colors={soft ? gradients.accentSoft : gradients.accent}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    </View>
  );
}
