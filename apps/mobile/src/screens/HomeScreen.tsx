import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, Layout } from 'react-native-reanimated';
import type { Lead, Order, Paginated } from '@decor/shared';
import { UNIT_LABEL } from '@decor/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { useDisplayUnit } from '../hooks/useUnit';
import {
  Avatar,
  Card,
  EmptyState,
  Icon,
  IconTile,
  Loader,
  Pill,
  RoundButton,
  Screen,
  SectionHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

/**
 * The home screen.
 *
 * One hero card carries the number that matters — the value sitting in the
 * pipeline — with the day's counts under it, then the four things people
 * actually do, then the live work. Everything below the hero is dark so the
 * hero is the only thing competing for a glance.
 */
export function HomeScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [unit] = useDisplayUnit();
  const [hideValue, setHideValue] = useState(false);

  const orders = useApi<Paginated<Order> & { unit: string }>(
    () => api.orders({ unit, limit: 6 }),
    [unit],
  );
  const leads = useApi<Paginated<Lead>>(() => api.leads({ converted: false, limit: 50 }), []);

  const pipelineValue = (leads.data?.data ?? []).reduce(
    (sum, lead) => sum + Number(lead.estimatedValue ?? 0),
    0,
  );
  const openLeads = leads.data?.data.length ?? 0;
  const totalOrders = orders.data?.meta.total ?? 0;

  const todayCount = (orders.data?.data ?? []).filter((order) => {
    const created = new Date(order.createdAt);
    const now = new Date();
    return created.toDateString() === now.toDateString();
  }).length;

  if (orders.loading && !orders.data) return <Loader label="Loading your shop" />;

  return (
    <Screen refreshing={orders.refreshing} onRefresh={() => { orders.refresh(); leads.refresh(); }}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.topBar}>
        <Pressable style={styles.identity} onPress={() => navigation.navigate('Settings')}>
          <Avatar name={user?.name} size={44} />
          <View style={{ marginLeft: spacing.md }}>
            <Text variant="body" bold>{user?.name}</Text>
            <Text variant="tiny" tone="muted">{user?.code} · {user?.role}</Text>
          </View>
        </Pressable>
        <View style={styles.topActions}>
          <RoundButton icon="search" onPress={() => navigation.navigate('Search')} />
          <RoundButton icon="settings" onPress={() => navigation.navigate('Settings')} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(420).springify()}>
        <Card tone="accent">
          <View style={styles.heroTop}>
            <Text variant="small" tone="onAccent" style={{ opacity: 0.75 }}>
              Pipeline value
            </Text>
            <Pressable onPress={() => setHideValue((v) => !v)} hitSlop={10}>
              <Icon
                name={hideValue ? 'eyeOff' : 'eye'}
                size={18}
                color={palette.textOnAccent}
              />
            </Pressable>
          </View>

          <Text variant="display" tone="onAccent" style={styles.heroValue}>
            {hideValue ? '••••••' : formatInr(pipelineValue)}
          </Text>

          <View style={styles.heroMeta}>
            <View style={styles.heroBadge}>
              <Icon name="trend" size={12} color={palette.textOnAccent} />
              <Text variant="tiny" tone="onAccent" bold style={{ marginLeft: 4 }}>
                {openLeads} open
              </Text>
            </View>
            <Text variant="tiny" tone="onAccent" style={{ opacity: 0.7 }}>
              {totalOrders} orders · {todayCount} punched today
            </Text>
          </View>

          <View style={styles.heroActions}>
            <IconTile icon="plus" label="Punch" tone="dark" onAccentGround onPress={() => navigation.navigate('PunchTab')} />
            <IconTile icon="trend" label="Leads" tone="dark" onAccentGround onPress={() => navigation.navigate('Leads')} />
            <IconTile icon="layers" label="Board" tone="dark" onAccentGround onPress={() => navigation.navigate('Board')} />
            <IconTile icon="users" label="Clients" tone="dark" onAccentGround onPress={() => navigation.navigate('Clients')} />
          </View>
        </Card>
      </Animated.View>

      <SectionHeader
        title="Recent orders"
        actionLabel="View all"
        onAction={() => navigation.navigate('Orders')}
      />

      {orders.data?.data.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="Nothing punched yet"
          message="Tap the centre button to punch the first order."
        />
      ) : (
        orders.data?.data.slice(0, 5).map((order, index) => (
          <Animated.View
            key={order.id}
            entering={FadeInRight.delay(index * 60).duration(360)}
            layout={Layout.springify()}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}>
              <View style={styles.rowIcon}>
                <Icon name="arrowUpRight" size={18} color={palette.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body" bold numberOfLines={1}>{order.client.name}</Text>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {order.code} · {order.location}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Pill label={order.status.name} color={order.status.color} small />
                {order.items[0]?.display ? (
                  <Text variant="tiny" tone="muted" style={{ marginTop: 4 }}>
                    {order.items[0].display.length} × {order.items[0].display.width}{' '}
                    {UNIT_LABEL[order.items[0].display.unit]}
                  </Text>
                ) : null}
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <SectionHeader
        title="Live pipeline"
        actionLabel="Open"
        onAction={() => navigation.navigate('Leads')}
      />
      {(leads.data?.data ?? []).slice(0, 3).map((lead, index) => (
        <Animated.View key={lead.id} entering={FadeInRight.delay(index * 60).duration(360)}>
          <Card
            tone="dark"
            style={styles.row}
            onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })}>
            <Avatar name={lead.contactName ?? lead.client?.name ?? lead.title} size={38} tone="dark" />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text variant="body" bold numberOfLines={1}>{lead.title}</Text>
              <Text variant="tiny" tone="muted" numberOfLines={1}>
                {lead.contactName ?? lead.client?.name ?? '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Pill label={lead.status.name} color={lead.status.color} small />
              {lead.estimatedValue ? (
                <Text variant="tiny" tone="accent" bold style={{ marginTop: 4 }}>
                  {formatInr(Number(lead.estimatedValue))}
                </Text>
              ) : null}
            </View>
          </Card>
        </Animated.View>
      ))}
      {leads.data?.data.length === 0 ? (
        <EmptyState icon="trend" title="No open leads" message="New enquiries will appear here." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  identity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  topActions: { flexDirection: 'row', gap: spacing.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroValue: { marginTop: spacing.xs },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,26,5,0.14)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, padding: spacing.md },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.surfaceLit,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
});
