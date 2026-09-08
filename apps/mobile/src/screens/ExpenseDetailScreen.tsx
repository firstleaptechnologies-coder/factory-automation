import React, { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Expense, HistoryEntry } from '@decor/shared';
import { IMAGE_TARGETS, PERMISSIONS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import { HistoryTimeline } from '../components/HistoryTimeline';
import {
  Button,
  Card,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort, formatInr } from '../lib/format';

/** One expense, what it was recorded as, and everything since. */
export function ExpenseDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string = route.params.id;
  const { can } = useAuth();
  const expense = useApi<Expense>(() => api.expense(id), [id]);
  const history = useApi<HistoryEntry[]>(() => api.history('expenses', id), [id]);
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.EXPENSE_MANAGE);

  /**
   * The bill, photographed at the counter.
   *
   * Shot at the size-image target rather than the reference-image one: a bill
   * is read, not looked at, and the harder compression turns a printed rate
   * into a smudge.
   */
  const attachBill = async (source: 'camera' | 'library') => {
    const target = IMAGE_TARGETS.SIZE_IMAGE;
    const options = {
      mediaType: 'photo' as const,
      maxWidth: target.maxEdge,
      maxHeight: target.maxEdge,
      quality: (target.quality / 100) as never,
      selectionLimit: 1,
      includeBase64: false,
    };

    const result =
      source === 'camera' ? await launchCamera(options) : await launchImageLibrary(options);
    const asset = result.assets?.[0];
    if (result.didCancel || !asset?.uri) return;

    setBusy(true);
    try {
      await api.attachExpenseBillNative(id, {
        uri: asset.uri,
        type: asset.type ?? 'image/jpeg',
        name: asset.fileName ?? 'bill.jpg',
      });
      haptic('notificationSuccess');
      expense.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not attach', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const removeBill = async () => {
    setBusy(true);
    try {
      await api.removeExpenseBill(id);
      haptic('notificationSuccess');
      expense.reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Delete this expense?',
      'It comes off the books with its ledger entry. The history keeps a record of what was here.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteExpense(id);
              haptic('notificationSuccess');
              navigation.goBack();
            } catch (e) {
              haptic('notificationError');
              Alert.alert(
                'Could not delete',
                e instanceof Error ? e.message : 'Unknown error',
              );
            }
          },
        },
      ],
    );
  };

  if (expense.loading) return <Loader label="Loading" />;
  const row = expense.data;
  if (!row) return null;

  return (
    <Screen refreshing={expense.refreshing} onRefresh={expense.refresh}>
      <ScreenHeader
        title={row.description}
        subtitle={formatDateShort(row.date)}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            {row.spentType}
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(Number(row.amount))}</Text>
          <Text variant="small" tone="onAccent" style={{ opacity: 0.8, marginTop: 4 }}>
            {row.paymentType} · paid to {row.toName}
          </Text>
        </Card>
      </Animated.View>

      <Card tone="dark" style={styles.block}>
        <Row label="Spent by" value={row.doneBy} />
        <Row label="Attributed to" value={row.vendor} />
        {row.order ? (
          <Row label="Against order" value={`${row.order.code} · ${row.order.client.name}`} />
        ) : null}
        {row.note ? <Row label="Note" value={row.note} /> : null}
        {row.createdBy ? <Row label="Recorded by" value={row.createdBy.name} /> : null}
      </Card>

      {row.vendorGstin || row.taxAmount != null ? (
        <Card tone="dark" style={styles.block}>
          <View style={styles.taxHead}>
            <Text variant="label" style={{ flex: 1 }}>Tax on this bill</Text>
            <Pill
              label={row.itcEligible ? 'Credit claimable' : 'No credit'}
              color={row.itcEligible ? palette.success : palette.textFaint}
              small
            />
          </View>
          {row.vendorGstin ? <Row label="Vendor GSTIN" value={row.vendorGstin} /> : null}
          {row.taxableValue != null ? (
            <Row label="Taxable value" value={formatInr(Number(row.taxableValue))} />
          ) : null}
          {row.taxAmount != null ? (
            <Row label="Tax" value={formatInr(Number(row.taxAmount))} />
          ) : null}
        </Card>
      ) : null}

      <Card tone="dark" style={styles.block}>
        <Text variant="label" tone="muted">The bill</Text>
        {row.bill ? (
          <>
            <Image
              source={{ uri: api.fileUrl(row.bill.id) }}
              style={styles.bill}
              resizeMode="contain"
            />
            {canManage ? (
              <Button title="Remove" variant="dark" loading={busy} onPress={removeBill} />
            ) : null}
          </>
        ) : canManage ? (
          <View style={styles.actions}>
            <Button
              title="Photograph it"
              variant="dark"
              loading={busy}
              onPress={() => attachBill('camera')}
              style={{ flex: 1 }}
            />
            <Button
              title="From gallery"
              variant="dark"
              loading={busy}
              onPress={() => attachBill('library')}
              style={{ flex: 1 }}
            />
          </View>
        ) : (
          <Text variant="small" tone="faint">No bill was attached.</Text>
        )}
      </Card>

      {canManage ? (
        <View style={styles.actions}>
          <Button
            title="Edit"
            variant="dark"
            onPress={() => navigation.navigate('ExpenseForm', { id })}
            style={{ flex: 1 }}
          />
          <Button title="Delete" variant="danger" onPress={remove} style={{ flex: 1 }} />
        </View>
      ) : null}

      <Text variant="label" tone="muted" style={styles.historyLabel}>History</Text>
      <HistoryTimeline
        entries={history.data ?? []}
        empty="Nothing has changed since this was recorded"
      />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="tiny" tone="muted">{label}</Text>
      <Text variant="small" style={{ flex: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  taxHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  bill: { width: '100%', height: 220, borderRadius: 12, marginTop: spacing.sm },
  historyLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
});
