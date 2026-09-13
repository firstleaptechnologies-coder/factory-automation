import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Employee, EmploymentStatus } from '@fas/shared';
import { EMPLOYMENT_STATUS_LABELS, PERMISSIONS } from '@fas/shared';
import { api } from '../api/client';
import { usePaginated } from '../hooks/usePaginated';
import { useAuth } from '../auth/AuthContext';
import { FilterSheet } from '../components/FilterSheet';
import {
  Avatar,
  Card,
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
import { formatDateShort } from '../lib/format';

/** The colour a person's standing reads as. */
const TONE: Record<EmploymentStatus, string> = {
  ACTIVE: palette.success,
  ON_LEAVE: palette.warning,
  LEFT: palette.textFaint,
};

/**
 * Who works here.
 *
 * People who have left are out of the way unless they are asked for: the
 * question this screen answers is nearly always "who is on the floor", not
 * "who ever was".
 */
export function EmployeesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmploymentStatus | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const feed = usePaginated<Employee>(
    (page) =>
      api.employees({
        search: search || undefined,
        status: status ?? undefined,
        page,
        limit: 25,
      }),
    [search, status],
  );

  const canManage = can(PERMISSIONS.EMPLOYEE_MANAGE);

  if (feed.loading && feed.items.length === 0) return <Loader label="Loading" />;

  return (
    <Screen
      refreshing={feed.refreshing}
      onRefresh={feed.refresh}
      onEndReached={feed.loadMore}>
      <ScreenHeader
        title="Employees"
        subtitle="Who works here"
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.actions}>
            <RoundButton
              icon="filter"
              testID="filter-button"
              onPress={() => setFilterOpen(true)}
            />
            {canManage ? (
              <RoundButton
                icon="tune"
                testID="letter-templates"
                onPress={() => navigation.navigate('AdminLetterTemplates')}
              />
            ) : null}
            {canManage ? (
              <RoundButton
                icon="plus"
                testID="add-employee"
                onPress={() => navigation.navigate('EmployeeForm', {})}
              />
            ) : null}
          </View>
        }
      />

      <Field
        label="Search"
        placeholder="Name, number or what they do"
        value={search}
        onChangeText={setSearch}
      />

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter people"
        dimensions={[
          {
            key: 'status',
            label: 'Standing',
            options: [
              { id: null, label: 'Everyone still here' },
              { id: 'ACTIVE', label: EMPLOYMENT_STATUS_LABELS.ACTIVE, color: TONE.ACTIVE },
              { id: 'ON_LEAVE', label: EMPLOYMENT_STATUS_LABELS.ON_LEAVE, color: TONE.ON_LEAVE },
              { id: 'LEFT', label: EMPLOYMENT_STATUS_LABELS.LEFT, color: TONE.LEFT },
            ],
          },
        ]}
        value={{ status }}
        onApply={(next) => setStatus((next.status as EmploymentStatus) ?? null)}
      />

      {feed.items.length === 0 ? (
        <EmptyState
          icon="users"
          title="Nobody on the list yet"
          message={canManage ? 'Tap + to add the first person' : undefined}
        />
      ) : (
        feed.items.map((person, index) => (
          <Animated.View
            key={person.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => navigation.navigate('EmployeeDetail', { id: person.id })}>
              <View style={styles.rowTop}>
                <Avatar name={person.name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>{person.name}</Text>
                  <Text variant="tiny" tone="muted" numberOfLines={1}>
                    {person.designation ?? 'No designation'}
                    {person.department ? ` · ${person.department}` : ''}
                  </Text>
                  <Text variant="tiny" tone="faint">
                    {person.code} · joined {formatDateShort(person.joinedOn)}
                  </Text>
                </View>
                <Pill
                  label={EMPLOYMENT_STATUS_LABELS[person.status]}
                  color={TONE[person.status]}
                  small
                />
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
        noun="people"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
