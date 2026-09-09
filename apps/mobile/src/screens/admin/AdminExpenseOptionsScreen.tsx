import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { ExpenseOption, ExpenseOptionField } from '@fas/shared';
import {
  EXPENSE_FIELD_HINTS,
  EXPENSE_FIELD_LABELS,
  EXPENSE_OPTION_FIELDS,
} from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';

/**
 * The five lists behind the expense form, kept by the shop.
 *
 * This is the screen that means an expense form never needs a developer. A
 * retired option stays on the rows that used it — an expense stores the label
 * rather than a reference — so hiding one changes what can be picked next,
 * never what was recorded last March.
 */
export function AdminExpenseOptionsScreen({ navigation }: { navigation: any }) {
  const options = useApi<ExpenseOption[]>(() => api.allExpenseOptions(), []);
  const [field, setField] = useState<ExpenseOptionField>('SPENT_TYPE');
  const [sheet, setSheet] = useState(false);
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState<'CASH' | 'BANK'>('BANK');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      haptic('notificationSuccess');
      options.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      await api.createExpenseOption({
        field,
        label: label.trim(),
        // Only a way of paying comes out of a drawer.
        ...(field === 'PAYMENT_TYPE' ? { account } : {}),
      });
      setLabel('');
      setSheet(false);
    });

  if (!options.data) return <Loader />;
  const rows = options.data.filter((option) => option.field === field);

  return (
    <Screen refreshing={options.refreshing} onRefresh={options.refresh}>
      <ScreenHeader
        title="Expense dropdowns"
        subtitle="Every list on the expense form"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.tabs}>
        {EXPENSE_OPTION_FIELDS.map((key) => (
          <Chip
            key={key}
            label={EXPENSE_FIELD_LABELS[key]}
            selected={field === key}
            onPress={() => setField(key)}
          />
        ))}
      </View>

      <Text variant="tiny" tone="muted" style={styles.hint}>
        {EXPENSE_FIELD_HINTS[field]}
      </Text>

      <Button
        title={`Add to ${EXPENSE_FIELD_LABELS[field].toLowerCase()}`}
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={() => setSheet(true)}
        style={{ marginBottom: spacing.lg }}
      />

      {rows.length === 0 ? (
        <Text variant="small" tone="faint">Nothing on this list yet.</Text>
      ) : (
        rows.map((option, index) => (
          <Animated.View
            key={option.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
            layout={Layout.springify()}>
            <Card tone="dark" style={styles.card}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{option.label}</Text>
                  {option.field === 'PAYMENT_TYPE' ? (
                    <Text variant="tiny" tone="muted">
                      {option.account === 'CASH'
                        ? 'Comes out of the drawer'
                        : 'Comes out of the bank'}
                    </Text>
                  ) : null}
                </View>
                {option.isActive ? null : (
                  <Pill label="Hidden" color={palette.textFaint} small />
                )}
                <Chip
                  label={option.isActive ? 'Hide' : 'Show'}
                  onPress={() =>
                    run(() =>
                      option.isActive
                        ? api.deleteExpenseOption(option.id)
                        : api.updateExpenseOption(option.id, { isActive: true }),
                    )
                  }
                />
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <Sheet
        visible={sheet}
        title={`New ${EXPENSE_FIELD_LABELS[field].toLowerCase()}`}
        subtitle={EXPENSE_FIELD_HINTS[field]}
        onClose={() => setSheet(false)}>
        <Field label="Name" value={label} onChangeText={setLabel} autoFocus />
        {field === 'PAYMENT_TYPE' ? (
          <Select
            label="Comes out of"
            hint="Cash leaves the drawer; anything else leaves the bank"
            value={account}
            options={[
              { value: 'CASH', label: 'Cash in hand' },
              { value: 'BANK', label: 'The bank' },
            ]}
            onChange={(value) => setAccount(value as 'CASH' | 'BANK')}
          />
        ) : null}
        <Button title="Add" loading={busy} disabled={!label.trim()} onPress={add} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
