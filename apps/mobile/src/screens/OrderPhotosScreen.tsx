import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { IMAGE_TARGETS, formatBytes } from '@decor/shared';
import { api } from '../api/client';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { palette, radius, spacing } from '../theme';

type Kind = 'REFERENCE_IMAGE' | 'SIZE_IMAGE';

/**
 * Attaching photos to an order.
 *
 * The picker is asked to downscale and compress before the file ever reaches
 * JavaScript — a 12 MP photo taken on site would otherwise be read into memory
 * at full size just to be shrunk. The server optimises again and is the
 * authority; this is about not moving the bytes in the first place.
 */
export function OrderPhotosScreen({ route, navigation }: { route: any; navigation: any }) {
  const { orderId } = route.params as { orderId: string };
  const [kind, setKind] = useState<Kind>('SIZE_IMAGE');
  const [description, setDescription] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);

  const target = IMAGE_TARGETS[kind];

  const pick = async (source: 'camera' | 'library') => {
    haptic('impactLight');
    const options = {
      mediaType: 'photo' as const,
      maxWidth: target.maxEdge,
      maxHeight: target.maxEdge,
      quality: (target.quality / 100) as never,
      selectionLimit: source === 'library' ? 5 : 1,
      includeBase64: false,
    };

    const result =
      source === 'camera' ? await launchCamera(options) : await launchImageLibrary(options);

    if (result.didCancel || result.errorCode) {
      if (result.errorCode === 'camera_unavailable') {
        Alert.alert('No camera', 'This device has no camera available.');
      } else if (result.errorCode === 'permission') {
        Alert.alert('Permission needed', 'Allow camera access in Settings to take photos.');
      }
      return;
    }
    setAssets((current) => [...current, ...(result.assets ?? [])]);
  };

  const upload = async () => {
    if (!assets.length) return;
    if (kind === 'REFERENCE_IMAGE' && !description.trim()) {
      Alert.alert('Description needed', 'A reference image needs a description.');
      return;
    }

    setBusy(true);
    try {
      const files = assets.map((asset, index) => ({
        uri: asset.uri!,
        type: asset.type ?? 'image/jpeg',
        name: asset.fileName ?? `photo-${index}.jpg`,
      }));
      await api.addAttachmentsNative(orderId, files, {
        kind,
        description: description.trim() || undefined,
      });
      haptic('notificationSuccess');
      navigation.goBack();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Add photos" onBack={() => navigation.goBack()} />

      <View style={styles.kindRow}>
        <Chip
          label="Size image"
          selected={kind === 'SIZE_IMAGE'}
          onPress={() => setKind('SIZE_IMAGE')}
        />
        <Chip
          label="Reference"
          selected={kind === 'REFERENCE_IMAGE'}
          onPress={() => setKind('REFERENCE_IMAGE')}
        />
      </View>

      <Text variant="small" tone="muted" style={styles.explain}>
        {kind === 'SIZE_IMAGE'
          ? 'The measured drawing or the tape on site. Kept at higher resolution so a dimension stays readable when someone zooms in.'
          : 'What the client wants it to look like. Needs a description so the floor knows what they were pointing at.'}
      </Text>

      <View style={styles.pickRow}>
        <Button
          title="Camera"
          variant="primary"
          icon={<Icon name="camera" size={18} color={palette.textOnAccent} />}
          onPress={() => pick('camera')}
          style={{ flex: 1, marginRight: spacing.md }}
        />
        <Button
          title="Library"
          variant="dark"
          icon={<Icon name="image" size={18} color={palette.text} />}
          onPress={() => pick('library')}
          style={{ flex: 1 }}
        />
      </View>

      {kind === 'REFERENCE_IMAGE' ? (
        <Field
          label="Description"
          placeholder="What is the client pointing at?"
          value={description}
          onChangeText={setDescription}
          containerStyle={{ marginTop: spacing.xl }}
        />
      ) : null}

      {assets.length ? (
        <>
          <Text variant="label" tone="muted" style={styles.blockLabel}>
            {assets.length} ready to upload
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {assets.map((asset, index) => (
              <Animated.View
                key={`${asset.uri}-${index}`}
                entering={FadeIn.duration(220)}
                exiting={FadeOut.duration(160)}
                layout={Layout.springify()}
                style={styles.thumb}>
                <Image source={{ uri: asset.uri }} style={styles.thumbImage} />
                <Text variant="micro" tone="faint" style={{ marginTop: 4 }}>
                  {asset.fileSize ? formatBytes(asset.fileSize) : ''}
                </Text>
                <Button
                  title="Remove"
                  variant="ghost"
                  size="sm"
                  onPress={() => setAssets((c) => c.filter((_, i) => i !== index))}
                  style={{ marginTop: 4 }}
                />
              </Animated.View>
            ))}
          </ScrollView>
        </>
      ) : (
        <Card tone="dark" style={styles.placeholder}>
          <Icon name="image" size={28} color={palette.textFaint} />
          <Text variant="small" tone="faint" style={{ marginTop: spacing.sm }}>
            Nothing selected yet
          </Text>
        </Card>
      )}

      <Button
        title={`Upload ${assets.length || ''}`.trim()}
        size="lg"
        loading={busy}
        disabled={!assets.length}
        onPress={upload}
        style={{ marginTop: spacing.xl }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kindRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  explain: { marginBottom: spacing.xl },
  pickRow: { flexDirection: 'row' },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  thumb: { width: 110, marginRight: spacing.md, alignItems: 'center' },
  thumbImage: {
    width: 110,
    height: 110,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLit,
  },
  placeholder: { alignItems: 'center', paddingVertical: spacing.xxl, marginTop: spacing.xl },
});
