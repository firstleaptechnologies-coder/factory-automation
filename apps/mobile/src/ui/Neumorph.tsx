import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
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

/**
 * The radius a shadow-casting layer may actually use.
 *
 * iOS derives a drop shadow from the layer's own shape, and it can only do that
 * when the layer draws its corners natively. Ask for a radius larger than half
 * the box — `radius.pill` is 999 — and the corners get drawn with a mask
 * instead, which the shadow ignores: a pill then casts a rectangle. Clamping to
 * half the shorter side gives the identical pill and keeps the shadow honest.
 *
 * Returns undefined until the view has been measured, so the first paint uses
 * the requested radius rather than flashing a square.
 */
function useShadowRadius(requested: number) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) =>
      current && current.width === width && current.height === height
        ? current
        : { width, height },
    );
  }, []);

  const radius = box
    ? Math.min(requested, Math.min(box.width, box.height) / 2)
    : requested;

  return { radius, onLayout };
}

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
  const { offset, blur, dark, light } = depth[size];
  const shadow = useShadowRadius(radius);

  if (variant === 'flat') {
    return (
      <View
        onLayout={shadow.onLayout}
        style={[{ borderRadius: shadow.radius, backgroundColor: palette.surface }, style]}>
        <View style={contentStyle}>{children}</View>
      </View>
    );
  }

  // An inner shadow does not exist in React Native, so a well is drawn as a
  // reversed gradient inside a dark rim: the top edge falls into shade and the
  // bottom edge catches light, which reads as depressed.
  if (variant === 'inset') {
    return (
      <View
        onLayout={shadow.onLayout}
        style={[styles.insetOuter, { borderRadius: shadow.radius }, style]}>
        <View style={[{ borderRadius: shadow.radius, overflow: 'hidden' }, contentStyle]}>
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
      onLayout={shadow.onLayout}
      style={[
        {
          borderRadius: shadow.radius,
          // iOS derives a shadow from the layer's own opaque backing, not from
          // its children. Without a background colour here the layer is empty
          // and the shadow falls back to the bounding rectangle. The fill is
          // hidden behind the content either way.
          backgroundColor: palette.surface,
          shadowColor: '#000000',
          shadowOffset: { width: offset, height: offset },
          shadowOpacity: dark,
          shadowRadius: blur,
          elevation: 8,
        },
        style,
      ]}>
      <View
        style={{
          borderRadius: shadow.radius,
          backgroundColor: palette.surface,
          shadowColor: '#FFFFFF',
          shadowOffset: { width: -offset, height: -offset },
          shadowOpacity: light,
          shadowRadius: blur,
        }}>
        <View style={[{ borderRadius: shadow.radius, overflow: 'hidden' }, contentStyle]}>
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
  const shadow = useShadowRadius(radius);

  return (
    <View
      onLayout={shadow.onLayout}
      style={[
        {
          borderRadius: shadow.radius,
          // Same reason as Neumorph: the glow has to be cast by a rounded,
          // opaque layer or it comes out as a rectangular halo.
          backgroundColor: palette.accent,
          shadowColor: palette.accent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: soft ? 0.3 : 0.42,
          // Wide and soft. A tight halo reads as an outline drawn round the
          // panel rather than as light coming off it.
          shadowRadius: soft ? 16 : 24,
          elevation: 12,
        },
        style,
      ]}>
      <View style={[{ borderRadius: shadow.radius, overflow: 'hidden' }, contentStyle]}>
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
