import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, Layout } from 'react-native-reanimated';
import type { Lead, Order, Paginated, Workflow } from '@fas/shared';
import { PERMISSIONS, UNIT_LABEL } from '@fas/shared';
import { api } from '../api/client';
import { goTo } from '../navigation/routes';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { useDisplayUnit } from '../hooks/useUnit';
import type { IconName } from '../ui';
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
import { font, palette, spacing } from '../theme';
import { fitLabels } from '../lib/fitLabels';
import { formatInr } from '../lib/format';

/**
 * The home screen.
 *
 * The hero card answers the question the shop actually opens the app for:
 * where the work is standing right now. Which stages it counts is the shop's
 * own choice — set on Admin → Status flow → Main card — because the stage a
 * joinery watches is not the stage a stone unit watches.
 *
 * Under it, the day's counts, the four things people do, then the live work.
 * Everything below the hero is dark so the hero is the only thing competing
 * for a glance.
 */
export function HomeScreen({ navigation }: { navigation: any }) {
  const { user, can } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [unit] = useDisplayUnit();

  /* Refetched whenever the screen regains focus, like everything else. */
  const unread = useApi<{ unread: number }>(() => api.unreadNotifications(), []);

  const orders = useApi<Paginated<Order> & { unit: string }>(
    () => api.orders({ unit, limit: 6 }),
    [unit],
  );
  const leads = useApi<Paginated<Lead>>(() => api.leads({ converted: false, limit: 50 }), []);
  // The counts ride along with the flow, so the summary costs no extra call.
  const workflow = useApi<Workflow>(() => api.defaultWorkflow(), []);

  const summary = (workflow.data?.statuses ?? [])
    .filter((status) => status.homeCardOrder !== null && status.homeCardOrder !== undefined)
    .sort((a, b) => (a.homeCardOrder ?? 0) - (b.homeCardOrder ?? 0));

  /*
   * Both rows on the card are sized as rows, not as labels.
   *
   * Left to shrink themselves, five labels came out at five different sizes —
   * "Design" full size beside a visibly smaller "Order confirmed" — which
   * reads as a mistake rather than as a fit. Each row takes one size, worked
   * out from its own longest member.
   */
  const [cardWidth, setCardWidth] = useState(0);
  const stageSize = fitLabels(
    summary.map((status) => status.name),
    cardWidth,
    { base: font.micro, min: 7, gap: spacing.xs },
  );
  const tiles = [
    can(PERMISSIONS.ESTIMATE_VIEW) && { icon: 'clipboard' as const, label: 'Quotes', to: 'Estimates' },
    can(PERMISSIONS.CLIENT_VIEW) && { icon: 'users' as const, label: 'Clients', to: 'Clients' },
    can(PERMISSIONS.CASH_POSITION_VIEW) && { icon: 'card' as const, label: 'Transactions', to: 'Transactions' },
    can(PERMISSIONS.DISBURSEMENT_VIEW) && { icon: 'arrowUpRight' as const, label: 'Payout', to: 'DisbursementLedger' },
    can(PERMISSIONS.ORDER_PUNCH) && { icon: 'plus' as const, label: 'Punch', to: 'PunchTab' },
  ].filter(Boolean) as { icon: IconName; label: string; to: string }[];
  const tileSize = fitLabels(
    tiles.map((tile) => tile.label),
    cardWidth,
    { base: font.tiny, min: 8 },
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
          {/* Search and the settings dial both live in the bar now; the bell is
              the only thing up here that is about this moment. */}
          <View>
            <RoundButton
              icon="bell"
              testID="open-notifications"
              accessibilityLabel="Notifications"
              onPress={() => navigation.navigate('Notifications')}
            />
            {/* A count rather than a plain dot: "three things happened" is a
                different decision from "something happened". */}
            {unread.data?.unread ? (
              <View testID="unread-badge" style={styles.badge} pointerEvents="none">
                <Text variant="micro" tone="onAccent" bold>
                  {unread.data.unread > 9 ? '9+' : unread.data.unread}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(420).springify()}>
        <Card tone="accent">
          {/* One measurement, shared by both rows on the card. */}
          <View
            testID="home-card-measure"
            style={styles.measure}
            onLayout={(event) => setCardWidth(event.nativeEvent.layout.width)}
          />
          <View style={styles.heroTop}>
            <Text variant="small" tone="onAccent" style={{ opacity: 0.75 }}>
              Where the work is
            </Text>
            {isAdmin ? (
              <Pressable
                testID="edit-home-card"
                onPress={() => navigation.navigate('MainCard')}
                hitSlop={10}>
                <Icon name="tune" size={18} color={palette.textOnAccent} />
              </Pressable>
            ) : null}
          </View>

          {summary.length === 0 ? (
            <Text variant="small" tone="onAccent" style={styles.heroEmpty}>
              {isAdmin
                ? 'No stages chosen yet — tap the dial to pick which ones this card counts.'
                : 'No stages are being counted here yet.'}
            </Text>
          ) : (
            <View style={styles.stageRow}>
              {summary.map((status) => (
                <Pressable
                  key={status.id}
                  testID={`home-stage-${status.id}`}
                  style={styles.stage}
                  onPress={() => navigation.navigate('Orders', { statusId: status.id })}>
                  <Text variant="h1" tone="onAccent">
                    {status._count?.ordersAtStatus ?? 0}
                  </Text>
                  {/*
                    One line, shrinking to fit.
                    Wrapped over two, "Order confirmed" and "QC & Sanding"
                    pushed the row of counts out of line with each other and
                    the card read as ragged.
                  */}
                  <Text
                    variant="micro"
                    tone="onAccent"
                    numberOfLines={1}
                    style={[styles.stageName, { fontSize: stageSize }]}>
                    {status.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

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

          {/*
            The boards are not here: each is a way of looking at its own list,
            reached from it. Punching is last — it is the one that starts
            something rather than looks at something, and the thumb lands on
            the right-hand end.
          */}
          <View style={styles.heroActions}>
            {tiles.map((tile) => (
              <IconTile
                key={tile.label}
                icon={tile.icon}
                label={tile.label}
                labelSize={tileSize}
                tone="dark"
                fluid
                onAccentGround
                onPress={() => goTo(navigation, tile.to)}
              />
            ))}
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
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  identity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  topActions: { flexDirection: 'row', gap: spacing.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroEmpty: { marginTop: spacing.md, opacity: 0.85, lineHeight: 18 },
  /*
   * Five across on a phone. Each stage gets an equal share and its name wraps
   * to two lines rather than truncating — "Design approval" and "QC & Sanding"
   * are only distinguishable in full.
   */
  stageRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.xs },
  stage: { flex: 1, alignItems: 'center' },
  stageName: { textAlign: 'center', opacity: 0.8, marginTop: 2 },
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
  measure: { height: 0 },
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
