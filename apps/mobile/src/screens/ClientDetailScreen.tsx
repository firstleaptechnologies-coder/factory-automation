import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Client, Order } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Avatar,
  Card,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { relativeTime } from '../lib/format';

export function ClientDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { clientId } = route.params as { clientId: string };
  const client = useApi<Client & { orders?: Order[] }>(() => api.client(clientId), [clientId]);

  if (!client.data) return <Loader />;
  const data = client.data;

  return (
    <Screen refreshing={client.refreshing} onRefresh={client.refresh}>
      <ScreenHeader title={data.code} onBack={() => navigation.goBack()} />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent" style={styles.hero}>
          <Avatar name={data.name} size={58} tone="dark" />
          <Text variant="h1" tone="onAccent" style={{ marginTop: spacing.md }}>{data.name}</Text>
          {data.company ? (
            <Text variant="small" tone="onAccent" style={{ opacity: 0.75 }}>{data.company}</Text>
          ) : null}
          <View style={styles.heroMeta}>
            {data.phone ? (
              <View style={styles.metaItem}>
                <Icon name="phone" size={13} color={palette.textOnAccent} />
                <Text variant="tiny" tone="onAccent" style={{ marginLeft: 4 }}>{data.phone}</Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <Icon name="clipboard" size={13} color={palette.textOnAccent} />
              <Text variant="tiny" tone="onAccent" style={{ marginLeft: 4 }}>
                {data.orders?.length ?? 0} orders
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <Card
        tone="dark"
        style={{ marginTop: spacing.lg }}
        onPress={() => navigation.navigate('ClientFirm', { clientId: data.id })}>
        <View style={styles.firmRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="label" tone="muted">Firm details</Text>
            <Text variant="tiny" tone="faint" numberOfLines={2}>
              {data.gstin
                ? `GSTIN ${data.gstin}${data.stateName ? ` · ${data.stateName}` : ''}`
                : 'GST number, addresses and a second contact number'}
            </Text>
          </View>
          <Icon name="chevronRight" size={14} color={palette.textFaint} />
        </View>
      </Card>

      {data.locations?.length ? (
        <>
          <SectionHeader title="Sites" />
          {data.locations.map((location) => (
            <Card key={location.id} tone="dark" style={styles.row}>
              <Icon name="pin" size={16} color={palette.accent} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text variant="small" bold>{location.name}</Text>
                {location.address ? (
                  <Text variant="tiny" tone="muted">{location.address}</Text>
                ) : null}
              </View>
              {location.useCount ? (
                <Text variant="tiny" tone="faint">×{location.useCount}</Text>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      <SectionHeader title="Orders" />
      {data.orders?.length ? (
        data.orders.map((order) => (
          <Card
            key={order.id}
            tone="dark"
            style={styles.row}
            onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}>
            <View style={{ flex: 1 }}>
              <Text variant="small" bold>{order.code}</Text>
              <Text variant="tiny" tone="muted">{relativeTime(order.createdAt)}</Text>
            </View>
            <Pill label={order.status.name} color={order.status.color} small />
          </Card>
        ))
      ) : (
        <Text variant="small" tone="faint">No orders yet.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  firmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  heroMeta: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, padding: spacing.md },
});
