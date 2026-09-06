import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Client, Paginated } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Avatar,
  Card,
  EmptyState,
  Field,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';

export function ClientsScreen({ navigation }: { navigation: any }) {
  const [search, setSearch] = useState('');
  const clients = useApi<Paginated<Client>>(
    () => api.clients({ search: search || undefined, limit: 100 }),
    [search],
  );

  return (
    <Screen refreshing={clients.refreshing} onRefresh={clients.refresh}>
      <ScreenHeader
        title="Clients"
        subtitle={`${clients.data?.meta.total ?? 0} on file`}
        onBack={() => navigation.goBack()}
      />

      <Field
        placeholder="Name, phone or code"
        value={search}
        onChangeText={setSearch}
        icon="search"
      />

      {clients.loading && !clients.data ? (
        <Loader />
      ) : clients.data?.data.length === 0 ? (
        <EmptyState
          icon="users"
          title="No clients yet"
          message="Clients are added automatically as orders are punched."
        />
      ) : (
        clients.data?.data.map((client, index) => (
          <Animated.View
            key={client.id}
            entering={FadeInDown.delay(Math.min(index, 10) * 35).duration(300)}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => navigation.navigate('ClientDetail', { clientId: client.id })}>
              <Avatar name={client.name} size={44} tone="dark" />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text variant="body" bold numberOfLines={1}>{client.name}</Text>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {client.code}
                  {client.phone ? ` · ${client.phone}` : ''}
                  {client.company ? ` · ${client.company}` : ''}
                </Text>
              </View>
              <View style={styles.countBadge}>
                <Text variant="tiny" tone="accent" bold>{client._count?.orders ?? 0}</Text>
              </View>
              <Icon name="chevronRight" size={16} color={palette.textFaint} />
            </Card>
          </Animated.View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, padding: spacing.md },
  countBadge: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: palette.surfaceLit,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
});
