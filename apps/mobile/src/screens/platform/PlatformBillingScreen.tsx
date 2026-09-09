import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MODULE_CATALOGUE } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { Card, Chip, Loader, Pill, Screen, ScreenHeader, Text } from '../../ui';
import { palette, spacing } from '../../theme';
import { formatInr } from '../../lib/format';

interface BillingRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  tierLabel: string | null;
  monthlyTotal: number;
  unpriced: string[];
  trialDaysLeft: number | null;
  billingDay: number | null;
}

interface Billing {
  rows: BillingRow[];
  totals: { monthlyRecurring: number; paying: number; onTrial: number; suspended: number };
  needsAttention: {
    trialsExpired: BillingRow[];
    trialsEndingSoon: BillingRow[];
    trialsWithNoEnd: BillingRow[];
    unpriced: BillingRow[];
    payingNothing: BillingRow[];
  };
}

/**
 * The book of business.
 *
 * What everybody is on, what they pay, and — first, because it is the only
 * part anybody acts on — what is about to stop being true. A trial that ended
 * in March and one ending on Friday are the same row, and neither is visible
 * in a list sorted by name.
 *
 * Nothing is collected here: there is no payment gateway yet, and this screen
 * does not pretend there is.
 */
export function PlatformBillingScreen({ navigation }: { navigation: any }) {
  const billing = useApi<Billing>(() => api.platformBilling() as Promise<Billing>, []);

  if (!billing.data) return <Loader label="Loading" />;

  const { rows, totals, needsAttention } = billing.data;
  const label = (key: string) =>
    MODULE_CATALOGUE.find((one) => one.key === key)?.label ?? key;

  const groups: { key: string; title: string; rows: BillingRow[]; why: string }[] = [
    {
      key: 'expired',
      title: 'Trials that have run out',
      rows: needsAttention.trialsExpired,
      why: 'Every day one stays open is the product given away by accident.',
    },
    {
      key: 'soon',
      title: 'Trials ending within a week',
      rows: needsAttention.trialsEndingSoon,
      why: 'Somebody has to speak to them before Friday.',
    },
    {
      key: 'noend',
      title: 'Trials with no end date',
      rows: needsAttention.trialsWithNoEnd,
      why: 'A trial without a date never ends, and nobody ever notices.',
    },
    {
      key: 'unpriced',
      title: 'Add-ons nobody has priced',
      rows: needsAttention.unpriced,
      why: 'Billed at nothing, which looks like given away on purpose.',
    },
    {
      key: 'free',
      title: 'Paying clients billed nothing',
      rows: needsAttention.payingNothing,
      why: 'Active, on a tier, and the tier costs zero.',
    },
  ];

  const worth = groups.filter((one) => one.rows.length > 0);

  return (
    <Screen refreshing={billing.refreshing} onRefresh={billing.refresh}>
      <ScreenHeader
        title="Billing"
        subtitle="What everybody is on, and what it is worth"
        onBack={() => navigation.goBack()}
      />

      <Card tone="accent" style={styles.card}>
        <Text variant="label" tone="onAccent">Monthly recurring</Text>
        <Text variant="display" tone="onAccent">{formatInr(totals.monthlyRecurring)}</Text>
        <Text variant="tiny" tone="onAccent">
          from {totals.paying} paying {totals.paying === 1 ? 'client' : 'clients'} ·{' '}
          {totals.onTrial} on trial
        </Text>
      </Card>

      <Text variant="label" tone="muted" style={styles.head}>Needs doing</Text>
      {worth.length === 0 ? (
        <Card tone="dark" style={styles.card}>
          <Text variant="small" tone="muted">
            Nothing is expiring, unpriced or quietly free.
          </Text>
        </Card>
      ) : null}
      {worth.map((group) => (
        <Card key={group.key} tone="dark" style={styles.card}>
          <View style={styles.row}>
            <Text variant="small" bold style={{ flex: 1 }}>{group.title}</Text>
            <Pill label={String(group.rows.length)} color={palette.warning} small />
          </View>
          <Text variant="tiny" tone="muted">{group.why}</Text>
          <View style={styles.chips}>
            {group.rows.map((row) => (
              <Chip
                key={row.id}
                label={
                  group.key === 'unpriced'
                    ? `${row.name} · ${row.unpriced.map(label).join(', ')}`
                    : row.name
                }
                onPress={() => navigation.navigate('TenantDetail', { id: row.id })}
              />
            ))}
          </View>
        </Card>
      ))}

      <Text variant="label" tone="muted" style={styles.head}>Every workspace</Text>
      {rows.map((row) => (
        <Card
          key={row.id}
          tone="dark"
          style={styles.card}
          onPress={() => navigation.navigate('TenantDetail', { id: row.id })}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>{row.name}</Text>
              <Text variant="tiny" tone="muted">
                {row.tierLabel ?? 'no tier'}
                {row.billingDay ? ` · billed on the ${row.billingDay}th` : ''}
              </Text>
            </View>
            <Text variant="small" bold>{formatInr(row.monthlyTotal)}</Text>
          </View>
        </Card>
      ))}

      <Text variant="tiny" tone="muted" style={styles.head}>
        Nothing is collected here yet — there is no payment gateway attached. What this says is
        what is owed and on which day.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  head: { marginTop: spacing.xl, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
