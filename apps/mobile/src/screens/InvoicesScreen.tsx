import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Invoice } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Card,
  EmptyState,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort, formatInr } from '../lib/format';

/**
 * Every bill the shop has raised, newest first.
 *
 * The search covers the invoice number, the client and the order number
 * together, because somebody holding a piece of paper has one of the three and
 * does not know which of them the system calls it.
 */
export function InvoicesScreen({ navigation }: { navigation: any }) {
  const [search, setSearch] = useState('');
  const invoices = useApi<Invoice[]>(
    () => api.invoices(search ? { search } : undefined),
    [search],
  );

  const rows = invoices.data ?? [];
  // Cancelled invoices keep their numbers and are counted nowhere: what they
  // claimed is nothing. Summing them would overstate the month's billing.
  const billed = rows
    .filter((row) => row.status === 'ISSUED')
    .reduce((sum, row) => sum + Number(row.total), 0);

  if (invoices.loading && rows.length === 0) return <Loader label="Loading invoices" />;

  return (
    <Screen refreshing={invoices.refreshing} onRefresh={invoices.refresh}>
      <ScreenHeader
        title="Invoices"
        subtitle="What the shop has billed"
        onBack={() => navigation.goBack()}
      />

      <Card tone="accent">
        <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
          Billed
        </Text>
        <Text variant="display" tone="onAccent">{formatInr(billed)}</Text>
        <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75, marginTop: spacing.sm }}>
          {rows.length} document{rows.length === 1 ? '' : 's'} · cancelled ones claim nothing
        </Text>
      </Card>

      <Field
        label="Find one"
        placeholder="Invoice number, client or order"
        value={search}
        onChangeText={setSearch}
        containerStyle={{ marginTop: spacing.lg }}
      />

      {rows.length === 0 ? (
        <EmptyState icon="receipt" title="Nothing billed yet" />
      ) : (
        rows.map((row) => (
          <Card
            key={row.id}
            tone="dark"
            style={styles.row}
            onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: row.id })}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.code}</Text>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {row.clientName}
                  {row.order?.code ? ` · ${row.order.code}` : ''}
                </Text>
                <Text variant="tiny" tone="faint">{formatDateShort(row.issuedOn)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h3">{formatInr(Number(row.total))}</Text>
                <Pill
                  label={row.status === 'CANCELLED' ? 'Cancelled' : 'Issued'}
                  color={row.status === 'CANCELLED' ? palette.danger : palette.success}
                  small
                />
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.sm, marginTop: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
