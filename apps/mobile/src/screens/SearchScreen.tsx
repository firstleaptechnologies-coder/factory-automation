import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Client, Lead, Order } from '@fas/shared';
import { api } from '../api/client';
import {
  Avatar,
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Pill,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { relativeTime } from '../lib/format';

type Scope = 'all' | 'orders' | 'leads' | 'clients';

/**
 * One search box across orders, leads and clients.
 *
 * The three endpoints are queried together and the results grouped, because the
 * person searching usually knows a name or a number and not which of the three
 * it belongs to.
 */
export function SearchScreen({ navigation }: { navigation: any }) {
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!term.trim()) {
      setOrders([]);
      setLeads([]);
      setClients([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [o, l, c] = await Promise.all([
          scope === 'all' || scope === 'orders'
            ? api.orders({ search: term, limit: 8 }).then((r) => r.data)
            : Promise.resolve([]),
          scope === 'all' || scope === 'leads'
            ? api.leads({ search: term, limit: 8 }).then((r) => r.data)
            : Promise.resolve([]),
          scope === 'all' || scope === 'clients'
            ? api.searchClients(term)
            : Promise.resolve([]),
        ]);
        setOrders(o);
        setLeads(l);
        setClients(c);
      } catch {
        // A failed search should not throw a dialog at someone mid-typing.
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term, scope]);

  const empty = !orders.length && !leads.length && !clients.length;

  return (
    <Screen>
      <ScreenHeader title="Search" />

      <Field
        placeholder="Order, client, phone, enquiry…"
        value={term}
        onChangeText={setTerm}
        icon="search"
        autoFocus
      />

      <View style={styles.scopeRow}>
        {(['all', 'orders', 'leads', 'clients'] as Scope[]).map((s) => (
          <Chip
            key={s}
            label={s[0].toUpperCase() + s.slice(1)}
            selected={scope === s}
            onPress={() => setScope(s)}
          />
        ))}
      </View>

      {!term.trim() ? (
        <EmptyState
          icon="search"
          title="Search everything"
          message="Orders, leads and clients at once."
        />
      ) : empty && !searching ? (
        <EmptyState icon="search" title="Nothing found" message={`No match for “${term}”.`} />
      ) : null}

      {clients.length ? (
        <>
          <Text variant="label" tone="muted" style={styles.groupLabel}>Clients</Text>
          {clients.map((client, index) => (
            <Animated.View key={client.id} entering={FadeInDown.delay(index * 30).duration(280)}>
              <Card
                tone="dark"
                style={styles.row}
                onPress={() => navigation.navigate('ClientDetail', { clientId: client.id })}>
                <Avatar name={client.name} size={38} tone="dark" />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text variant="small" bold>{client.name}</Text>
                  <Text variant="tiny" tone="muted">{client.code}</Text>
                </View>
                <Icon name="chevronRight" size={15} color={palette.textFaint} />
              </Card>
            </Animated.View>
          ))}
        </>
      ) : null}

      {orders.length ? (
        <>
          <Text variant="label" tone="muted" style={styles.groupLabel}>Orders</Text>
          {orders.map((order, index) => (
            <Animated.View key={order.id} entering={FadeInDown.delay(index * 30).duration(280)}>
              <Card
                tone="dark"
                style={styles.row}
                onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}>
                <View style={{ flex: 1 }}>
                  <Text variant="small" bold>{order.client.name}</Text>
                  <Text variant="tiny" tone="muted">
                    {order.code} · {relativeTime(order.createdAt)}
                  </Text>
                </View>
                <Pill label={order.status.name} color={order.status.color} small />
              </Card>
            </Animated.View>
          ))}
        </>
      ) : null}

      {leads.length ? (
        <>
          <Text variant="label" tone="muted" style={styles.groupLabel}>Leads</Text>
          {leads.map((lead, index) => (
            <Animated.View key={lead.id} entering={FadeInDown.delay(index * 30).duration(280)}>
              <Card
                tone="dark"
                style={styles.row}
                onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })}>
                <View style={{ flex: 1 }}>
                  <Text variant="small" bold numberOfLines={1}>{lead.title}</Text>
                  <Text variant="tiny" tone="muted">
                    {lead.code} · {lead.contactName ?? lead.client?.name ?? '—'}
                  </Text>
                </View>
                <Pill label={lead.status.name} color={lead.status.color} small />
              </Card>
            </Animated.View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scopeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  groupLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, padding: spacing.md },
});
