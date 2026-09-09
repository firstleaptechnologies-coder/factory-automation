import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MODULE_CATALOGUE } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';
import { formatInr } from '../../lib/format';

interface BillingRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  /** Ours. Counted nowhere, shown anyway. */
  isInternal: boolean;
  tierLabel: string | null;
  monthlyTotal: number;
  unpriced: string[];
  trialDaysLeft: number | null;
  billingDay: number | null;
}

interface Invoice {
  id: string;
  period: string;
  amount: number;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'FAILED' | 'VOID';
  lines: { kind: string; label: string; amount: number }[];
  paymentUrl: string | null;
  failureReason: string | null;
  workspace: { id: string; name: string } | null;
}

interface Gateway {
  provider: string;
  connected: boolean;
  webhooksVerifiable: boolean;
}

interface Billing {
  rows: BillingRow[];
  totals: {
    monthlyRecurring: number;
    paying: number;
    onTrial: number;
    suspended: number;
    internal: number;
  };
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
  const { can } = useAuth();
  const billing = useApi<Billing>(() => api.platformBilling() as Promise<Billing>, []);
  const gateway = useApi<Gateway>(() => api.billingGateway(), []);
  const invoices = useApi<Invoice[]>(() => api.billingInvoices() as Promise<Invoice[]>, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [reason, setReason] = useState('');
  const mayBill = can('platform.pricing.manage');

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
      haptic('notificationSuccess');
      invoices.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('That did not work', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

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
          {totals.internal ? ` · ${totals.internal} of ours, counted nowhere` : ''}
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
            {/*
              Ours shows what it would be worth rather than a figure that
              reads as money coming in — hiding it loses the answer to "what
              would we charge for this".
            */}
            {row.isInternal ? (
              <Text variant="small" tone="muted">ours</Text>
            ) : (
              <Text variant="small" bold>{formatInr(row.monthlyTotal)}</Text>
            )}
          </View>
        </Card>
      ))}

      <Text variant="label" tone="muted" style={styles.head}>Invoices</Text>
      {mayBill ? (
        <Button
          title="Work out this month"
          variant="dark"
          loading={busy === 'run'}
          onPress={() => void run('run', () => api.runBilling())}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}

      {(invoices.data ?? []).length === 0 ? (
        <Card tone="dark" style={styles.card}>
          <Text variant="small" tone="muted">
            No bills have been written yet. They are drafted on each workspace’s billing day.
          </Text>
        </Card>
      ) : null}

      {(invoices.data ?? []).map((invoice) => (
        <Card key={invoice.id} tone="dark" style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>
                {invoice.workspace?.name ?? 'Unknown workspace'} · {invoice.period.slice(0, 7)}
              </Text>
              <Text variant="tiny" tone="muted">
                {invoice.lines
                  .map((line) => `${line.label} ${formatInr(line.amount)}`)
                  .join(' + ')}
              </Text>
              {invoice.failureReason ? (
                <Text variant="tiny" tone="danger">{invoice.failureReason}</Text>
              ) : null}
            </View>
            <Text variant="small" bold>{formatInr(invoice.amount)}</Text>
          </View>

          <View style={styles.chips}>
            <Pill
              label={invoice.status.toLowerCase()}
              color={
                invoice.status === 'PAID'
                  ? palette.success
                  : invoice.status === 'FAILED'
                    ? palette.danger
                    : invoice.status === 'ISSUED'
                      ? palette.info
                      : palette.textFaint
              }
              small
            />
            {mayBill && invoice.status !== 'PAID' && invoice.status !== 'VOID' ? (
              <>
                <Chip
                  label={invoice.status === 'DRAFT' ? 'Send it' : 'Send it again'}
                  // Without an account behind it, sending would mark a bill
                  // issued with nowhere to pay it.
                  onPress={
                    gateway.data?.connected
                      ? () => void run(invoice.id, () => api.issueInvoice(invoice.id))
                      : undefined
                  }
                />
                <Chip
                  label="Withdraw"
                  onPress={() => {
                    setVoiding(invoice);
                    setReason('');
                  }}
                />
              </>
            ) : null}
          </View>
        </Card>
      ))}

      <Text variant="tiny" tone="muted" style={styles.head}>
        {gateway.data?.connected
          ? gateway.data.webhooksVerifiable
            ? 'Razorpay is connected. A payment is recorded when Razorpay tells us it happened, never from a browser.'
            : 'Razorpay is connected, but no webhook secret is set — so payments will be collected and never recorded.'
          : 'No payment gateway is connected. Bills can be worked out and read, but not sent.'}
      </Text>
      <Sheet
        visible={Boolean(voiding)}
        title="Withdraw this bill"
        subtitle="Marked withdrawn, never deleted — a bill that was sent and withdrawn happened"
        onClose={() => setVoiding(null)}>
        <Field
          label="Why"
          value={reason}
          onChangeText={setReason}
          placeholder="Billed the wrong tier"
        />
        <Button
          title="Withdraw it"
          variant="danger"
          loading={busy === 'void'}
          disabled={reason.trim().length < 3}
          onPress={() =>
            void (async () => {
              await run('void', () => api.voidInvoice(voiding!.id, reason.trim()));
              setVoiding(null);
            })()
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  head: { marginTop: spacing.xl, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
