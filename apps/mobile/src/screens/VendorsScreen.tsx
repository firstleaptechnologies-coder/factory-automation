import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Vendor } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '../api/client';
import { usePaginated } from '../hooks/usePaginated';
import { useAuth } from '../auth/AuthContext';
import {
  Avatar,
  Card,
  Chip,
  EmptyState,
  Field,
  ListFooter,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';

/**
 * Everybody the shop buys from.
 *
 * A separate list from clients although the columns rhyme: the same firm is
 * occasionally both — a fabricator who supplies board and also orders panels —
 * and one list would have no way to say which way round.
 */
export function VendorsScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const feed = usePaginated<Vendor>(
    (page) =>
      api.vendors({
        search: search || undefined,
        includeInactive: includeInactive || undefined,
        page,
        limit: 25,
      }),
    [search, includeInactive],
  );

  const canManage = can(PERMISSIONS.VENDOR_MANAGE);

  if (feed.loading && feed.items.length === 0) return <Loader label="Loading" />;

  return (
    <Screen
      refreshing={feed.refreshing}
      onRefresh={feed.refresh}
      onEndReached={feed.loadMore}>
      <ScreenHeader
        title="Vendors"
        subtitle="Who the shop buys from"
        onBack={() => navigation.goBack()}
        right={
          canManage ? (
            <RoundButton
              icon="plus"
              testID="add-vendor"
              onPress={() => navigation.navigate('VendorDetail', {})}
            />
          ) : null
        }
      />

      <Field
        label="Search"
        placeholder="Name, number or what they supply"
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.filters}>
        <Chip
          label="Current"
          selected={!includeInactive}
          onPress={() => setIncludeInactive(false)}
        />
        <Chip
          label="Include retired"
          testID="include-retired"
          selected={includeInactive}
          onPress={() => setIncludeInactive(true)}
        />
      </View>

      {feed.items.length === 0 ? (
        <EmptyState
          icon="box"
          title="Nobody on the list yet"
          message={canManage ? 'Tap + to add the first one' : undefined}
        />
      ) : (
        feed.items.map((vendor, index) => (
          <Animated.View
            key={vendor.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => navigation.navigate('VendorDetail', { id: vendor.id })}>
              <View style={styles.rowTop}>
                <Avatar name={vendor.name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>{vendor.name}</Text>
                  <Text variant="tiny" tone="muted" numberOfLines={1}>
                    {vendor.supplies ?? 'Nothing said about what they supply'}
                  </Text>
                  <Text variant="tiny" tone="faint">
                    {vendor.code}
                    {vendor._count ? ` · ${vendor._count.purchases} purchases` : ''}
                  </Text>
                </View>
                {vendor.isActive ? null : (
                  <Pill label="Retired" color={palette.textFaint} small />
                )}
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.meta?.total ?? feed.items.length}
        noun="vendors"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
