import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { AppNotification } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Card, EmptyState, Icon, Loader, Screen, ScreenHeader, Text, haptic } from '../ui';
import { relativeTime } from '../lib/format';
import { palette, spacing } from '../theme';

/** Where a notification takes you, by what it is about. */
const OPENS: Record<string, (id: string) => { route: string; params: object }> = {
  Order: (id) => ({ route: 'OrderDetail', params: { orderId: id } }),
  Lead: (id) => ({ route: 'LeadDetail', params: { leadId: id } }),
  Estimate: (id) => ({ route: 'EstimateDetail', params: { estimateId: id } }),
};

/**
 * What happened while you were not looking.
 *
 * The row is the source of truth rather than a push: a phone that was off, a
 * person on leave, an app that was reinstalled — it is all still here when they
 * open this screen. A push, when there is one, only brings them here sooner.
 */
export function NotificationsScreen({ navigation }: { navigation: any }) {
  const feed = useApi<{ items: AppNotification[]; unread: number }>(
    useCallback(() => api.notifications(), []),
    [],
  );

  const open = async (item: AppNotification) => {
    haptic('impactLight');
    if (!item.readAt) {
      // Optimistic: the tap is the reading, and a failed request should not
      // stop the screen it was about from opening.
      void api.readNotification(item.id).catch(() => undefined);
    }
    const opens = item.entity ? OPENS[item.entity] : undefined;
    if (opens && item.entityId) {
      const { route, params } = opens(item.entityId);
      navigation.navigate(route, params);
    } else {
      feed.reload();
    }
  };

  const readAll = async () => {
    haptic('impactLight');
    await api.readAllNotifications().catch(() => undefined);
    feed.reload();
  };

  const items = feed.data?.items ?? [];

  return (
    <Screen refreshing={feed.refreshing} onRefresh={feed.refresh}>
      <ScreenHeader
        title="Notifications"
        subtitle={
          feed.data ? (feed.data.unread ? `${feed.data.unread} unread` : 'All caught up') : ' '
        }
        onBack={() => navigation.goBack()}
        right={
          feed.data?.unread ? (
            <Pressable onPress={readAll} accessibilityRole="button" hitSlop={8}>
              <Text variant="tiny" tone="accent" bold>
                Mark all read
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      {feed.loading && !feed.data ? (
        <Loader />
      ) : items.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Nothing yet"
          message="Moves on your orders and enquiries will show up here."
        />
      ) : (
        items.map((item, index) => (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 30).duration(240)}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => open(item)}>
              {/* Unread is a dot rather than a background: the list is read at
                  a glance, and a wall of highlighted rows is not. */}
              <View style={[styles.dot, item.readAt ? styles.read : null]} />
              <View style={{ flex: 1 }}>
                <Text variant="small" bold>{item.title}</Text>
                <Text variant="tiny" tone="muted">{item.body}</Text>
                <Text variant="micro" tone="faint" style={{ marginTop: 2 }}>
                  {relativeTime(item.createdAt)}
                </Text>
              </View>
              {item.entityId ? (
                <Icon name="chevronRight" size={16} color={palette.textFaint} />
              ) : null}
            </Card>
          </Animated.View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
  read: { backgroundColor: 'transparent' },
});
