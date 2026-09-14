import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Outstanding } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { formatInr } from '../lib/format';
import {
  Avatar,
  Card,
  EmptyState,
  Loader,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';

/**
 * What the shop is owed, and by whom.
 *
 * It was on no screen. The owner who trialled this worked it out on paper —
 * 43,200 + 16,200 + 25,000 — and said that until a screen showed it he would
 * not trust the rest of the numbers. It is also the screen to open before
 * ringing somebody, so the list is by person rather than by order and the
 * biggest debt is at the top.
 */
export function OutstandingScreen({ navigation }: { navigation: any }) {
  const owed = useApi<Outstanding>(() => api.outstanding(), []);

  if (!owed.data) return <Loader />;
  const data = owed.data;

  return (
    <Screen refreshing={owed.refreshing} onRefresh={owed.refresh}>
      <ScreenHeader
        title="Owed to you"
        subtitle={data.orders === 1 ? 'across 1 order' : `across ${data.orders} orders`}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={styles.faint}>Still to collect</Text>
          <Text variant="display" tone="onAccent">{formatInr(data.owed)}</Text>
          {/*
            Never netted against what is owed. A shop short on one order and
            holding too much on another is owed the first and holding the
            second; one figure would report the debt as smaller than it is.
          */}
          {data.held > 0 ? (
            <Text variant="small" tone="onAccent" style={styles.held} testID="held">
              Separately, {formatInr(data.held)} taken against orders that came to less.
            </Text>
          ) : null}
        </Card>
      </Animated.View>

      {data.clients.length === 0 ? (
        <EmptyState
          icon="check"
          title="Nothing outstanding"
          message="Every order that has been priced has been paid for."
        />
      ) : (
        <>
          <Text variant="label" tone="muted" style={styles.label}>Who owes it</Text>
          {data.clients.map((client, index) => (
            <Animated.View
              key={client.clientId}
              entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
              <Card
                tone="dark"
                style={styles.row}
                onPress={() =>
                  navigation.navigate('ClientDetail', { clientId: client.clientId })
                }>
                <Avatar name={client.name} size={42} tone="dark" />
                <View style={styles.who}>
                  <Text variant="h3" numberOfLines={1}>{client.name}</Text>
                  <Text variant="tiny" tone="muted">
                    {client.code} · {client.orders === 1 ? '1 order' : `${client.orders} orders`}
                  </Text>
                </View>
                <Text variant="h3" style={styles.amount}>{formatInr(client.owed)}</Text>
              </Card>
            </Animated.View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  faint: { opacity: 0.75 },
  held: { opacity: 0.85, marginTop: spacing.sm },
  label: { marginTop: spacing.xl, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  who: { flex: 1, minWidth: 0, marginLeft: spacing.md },
  amount: { color: palette.warning },
});
