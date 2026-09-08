import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Expense, ExpenseFormOptions, ExpenseOptionField } from '@decor/shared';
import { EXPENSE_FIELD_HINTS, EXPENSE_FIELD_LABELS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Button,
  Card,
  Chip,
  Field,
  Loader,
  Screen,
  ScreenHeader,
  Select,
  Text,
  haptic,
} from '../ui';
import { spacing } from '../theme';

/** Today, as the date column means it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record what was spent, or correct it.
 *
 * Five of these fields are lists the shop keeps itself, so nothing here is
 * hard-coded: the options come from the server, and a shop that starts buying
 * from somebody new adds the name on the dropdowns screen rather than asking
 * for a release.
 */
export function ExpenseFormScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string | undefined = route?.params?.id;
  const options = useApi<ExpenseFormOptions>(() => api.expenseOptions(), []);
  const existing = useApi<Expense | null>(
    () => (id ? api.expense(id) : Promise.resolve(null)),
    [id],
  );

  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [choice, setChoice] = useState<Record<ExpenseOptionField, string | null>>({
    PAYMENT_TYPE: null,
    DONE_BY: null,
    VENDOR: null,
    SPENT_TYPE: null,
    TO_NAME: null,
  });
  const [note, setNote] = useState('');

  // The tax half stays folded away: most expenses at a counter have no bill
  // worth claiming, and a form that asks for a GSTIN every time is a form
  // people stop filling in.
  const [taxOpen, setTaxOpen] = useState(false);
  const [vendorGstin, setVendorGstin] = useState('');
  const [taxableValue, setTaxableValue] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [itcEligible, setItcEligible] = useState(false);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setDate(row.date.slice(0, 10));
    setDescription(row.description);
    setAmount(String(row.amount));
    setChoice({
      PAYMENT_TYPE: row.paymentType,
      DONE_BY: row.doneBy,
      VENDOR: row.vendor,
      SPENT_TYPE: row.spentType,
      TO_NAME: row.toName,
    });
    setNote(row.note ?? '');
    setVendorGstin(row.vendorGstin ?? '');
    setTaxableValue(row.taxableValue == null ? '' : String(row.taxableValue));
    setTaxAmount(row.taxAmount == null ? '' : String(row.taxAmount));
    setItcEligible(row.itcEligible);
    if (row.vendorGstin || row.taxAmount != null) setTaxOpen(true);
  }, [existing.data]);

  const missing =
    !description.trim() ||
    !amount ||
    Number(amount) <= 0 ||
    Object.values(choice).some((value) => !value);

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        date,
        description: description.trim(),
        amount: Number(amount),
        paymentType: choice.PAYMENT_TYPE!,
        doneBy: choice.DONE_BY!,
        vendor: choice.VENDOR!,
        spentType: choice.SPENT_TYPE!,
        toName: choice.TO_NAME!,
        note: note.trim() || undefined,
        vendorGstin: vendorGstin.trim() || undefined,
        taxableValue: taxableValue ? Number(taxableValue) : undefined,
        taxAmount: taxAmount ? Number(taxAmount) : undefined,
        itcEligible,
      };
      const saved = id ? await api.updateExpense(id, body) : await api.createExpense(body);
      haptic('notificationSuccess');
      navigation.replace('ExpenseDetail', { id: saved.id });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (options.loading || existing.loading) return <Loader label="Loading" />;

  const list = (field: ExpenseOptionField) =>
    (options.data?.[field] ?? []).map((label) => ({ value: label, label }));

  const empty = (field: ExpenseOptionField) => (options.data?.[field] ?? []).length === 0;

  return (
    <Screen>
      <ScreenHeader
        title={id ? 'Edit expense' : 'Record an expense'}
        subtitle={id ? 'Corrects the books with it' : 'Posts to the ledger as it saves'}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(320)}>
        <Field
          label="What was it for"
          placeholder="Router bits, diesel, shop rent"
          value={description}
          onChangeText={setDescription}
        />
        <Field
          label="Amount"
          placeholder="0"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <Field label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} />

        {(['SPENT_TYPE', 'PAYMENT_TYPE', 'DONE_BY', 'TO_NAME', 'VENDOR'] as const).map(
          (field) => (
            <Select
              key={field}
              label={EXPENSE_FIELD_LABELS[field]}
              hint={empty(field) ? 'Nothing on this list yet — add one in settings' : undefined}
              value={choice[field]}
              options={list(field)}
              onChange={(value) => setChoice((prev) => ({ ...prev, [field]: value }))}
              title={EXPENSE_FIELD_HINTS[field]}
            />
          ),
        )}

        <Field
          label="Note"
          placeholder="Anything worth remembering"
          value={note}
          onChangeText={setNote}
          multiline
        />

        <Card tone="dark" style={styles.tax}>
          <View style={styles.taxHead}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Tax on this bill</Text>
              <Text variant="tiny" tone="muted">
                An expense whose tax can be claimed is a different number to the accountant
              </Text>
            </View>
            <Chip
              label={taxOpen ? 'On' : 'Off'}
              selected={taxOpen}
              onPress={() => setTaxOpen((open) => !open)}
            />
          </View>

          {taxOpen ? (
            <View style={{ marginTop: spacing.md }}>
              <Field
                label="Vendor GSTIN"
                placeholder="27AAACH7409R1ZZ"
                autoCapitalize="characters"
                value={vendorGstin}
                onChangeText={setVendorGstin}
              />
              <Field
                label="Taxable value"
                placeholder="0"
                keyboardType="numeric"
                value={taxableValue}
                onChangeText={setTaxableValue}
              />
              <Field
                label="Tax"
                placeholder="0"
                keyboardType="numeric"
                value={taxAmount}
                onChangeText={setTaxAmount}
              />
              <View style={styles.taxHead}>
                <Text variant="label" style={{ flex: 1 }}>Input credit can be claimed</Text>
                <Chip
                  label={itcEligible ? 'Yes' : 'No'}
                  selected={itcEligible}
                  onPress={() => setItcEligible((claimable) => !claimable)}
                />
              </View>
            </View>
          ) : null}
        </Card>

        <Button
          title={id ? 'Save' : 'Record it'}
          loading={busy}
          disabled={missing}
          onPress={submit}
          style={{ marginTop: spacing.lg }}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tax: { marginTop: spacing.lg },
  taxHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
