import React, { useEffect, useState } from 'react';
import { Dimensions, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { motion, palette, radius, spacing } from '../theme';
import { Text } from './Text';
import { Icon } from './Icon';
import { haptic } from './Button';

export interface ViewableImage {
  id: string;
  uri: string;
  /** The API serves attachments behind a bearer token. */
  headers?: Record<string, string>;
  caption?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** How far a downward drag has to travel before it counts as "put it away". */
const DISMISS_DISTANCE = 120;

/**
 * Looking at an attachment properly.
 *
 * A thumbnail is a reminder that a photo exists, not a way to read it — the
 * whole reason someone attaches a site picture or a measurement scribble is so
 * it can be examined later. So a tap opens the picture full screen, pinch and
 * double-tap zoom it, a drag moves it around once it is zoomed, and a drag
 * downward on an unzoomed picture puts it away.
 *
 * Written on Gesture Handler and Reanimated, which the app already carries,
 * rather than adding a viewer library: the gestures are the whole component and
 * they have to feel the same as the rest of the app.
 */
export function ImageViewer({
  images,
  index,
  onClose,
}: {
  images: ViewableImage[];
  /** The image to open on. `null` closes the viewer. */
  index: number | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);

  const visible = index !== null;
  const image = images[current];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        {image ? (
          <ZoomableImage
            key={image.id}
            image={image}
            onDismiss={onClose}
            onNext={
              current < images.length - 1 ? () => setCurrent((c) => c + 1) : undefined
            }
            onPrevious={current > 0 ? () => setCurrent((c) => c - 1) : undefined}
          />
        ) : null}

        <View style={[styles.top, { paddingTop: Math.max(insets.top, spacing.lg) }]}>
          <View style={{ flex: 1 }}>
            {images.length > 1 ? (
              <Text variant="small" style={styles.counter}>
                {current + 1} of {images.length}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} testID="viewer-close">
            <Icon name="close" size={20} color={palette.white} />
          </Pressable>
        </View>

        {image?.caption ? (
          <View style={[styles.caption, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text variant="small" style={styles.captionText}>
              {image.caption}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ZoomableImage({
  image,
  onDismiss,
  onNext,
  onPrevious,
}: {
  image: ViewableImage;
  onDismiss: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}) {
  const { width, height } = Dimensions.get('window');

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  /**
   * How far the picture may be dragged before its own edge comes past the
   * screen edge. Without this a zoomed picture can be flung away entirely and
   * the viewer shows black, which reads as the image having failed to load.
   */
  const limitX = () => Math.max((width * (savedScale.value - 1)) / 2, 0);
  const limitY = () => Math.max((height * (savedScale.value - 1)) / 2, 0);
  const clamp = (value: number, limit: number) =>
    Math.min(Math.max(value, -limit), limit);

  const reset = () => {
    scale.value = withTiming(1, { duration: motion.base });
    savedScale.value = 1;
    x.value = withTiming(0, { duration: motion.base });
    y.value = withTiming(0, { duration: motion.base });
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .withTestId(`viewer-pinch-${image.id}`)
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Snapping back from a pinch that ended at 1 keeps the picture centred
      // rather than stranded off to one side.
      if (scale.value <= MIN_SCALE) {
        runOnJS(reset)();
        return;
      }
      // Zooming back out can leave the picture further off-centre than the new
      // scale allows, so pull it back inside its own edges.
      x.value = withTiming(clamp(x.value, limitX()), { duration: motion.fast });
      y.value = withTiming(clamp(y.value, limitY()), { duration: motion.fast });
      savedX.value = clamp(savedX.value, limitX());
      savedY.value = clamp(savedY.value, limitY());
    });

  const pan = Gesture.Pan()
    .withTestId(`viewer-pan-${image.id}`)
    .onUpdate((event) => {
      if (savedScale.value <= MIN_SCALE) {
        // Unzoomed, the picture follows the finger so the dismiss and the
        // page-turn have something to show for themselves.
        x.value = savedX.value + event.translationX;
        y.value = savedY.value + event.translationY;
        return;
      }
      x.value = clamp(savedX.value + event.translationX, limitX());
      y.value = clamp(savedY.value + event.translationY, limitY());
    })
    .onEnd((event) => {
      // Unzoomed, the gesture means something different: a drag down puts the
      // picture away, and a sideways drag moves to the next one.
      if (savedScale.value <= MIN_SCALE) {
        if (event.translationY > DISMISS_DISTANCE) {
          runOnJS(onDismiss)();
          return;
        }
        if (event.translationX < -DISMISS_DISTANCE && onNext) {
          runOnJS(onNext)();
        } else if (event.translationX > DISMISS_DISTANCE && onPrevious) {
          runOnJS(onPrevious)();
        }
        runOnJS(reset)();
        return;
      }
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .withTestId(`viewer-double-tap-${image.id}`)
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(haptic)('impactLight');
      if (savedScale.value > MIN_SCALE) {
        runOnJS(reset)();
        return;
      }
      scale.value = withTiming(2.5, { duration: motion.base });
      savedScale.value = 2.5;
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.stage, { width, height }, style]}>
        <Image
          testID={`viewer-image-${image.id}`}
          source={{ uri: image.uri, headers: image.headers }}
          style={{ width, height }}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  counter: { color: palette.white, opacity: 0.8 },
  close: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  captionText: { color: palette.white, textAlign: 'center' },
});
