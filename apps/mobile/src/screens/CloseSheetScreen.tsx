import React, {useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {api} from '../api/client';
import {Button, Card} from '../components/ui';
import {colors, font, radius, spacing} from '../theme';

interface Offcut {
  lengthMm: string;
  widthMm: string;
}

/**
 * Closing a sheet is the one moment the shop floor can capture what is left of
 * a sheet. If the operator walks away without doing this, the offcut becomes an
 * unlabelled board leaning against a wall and the material is written off in
 * everything but name — so the screen is deliberately two taps from the job.
 */
export function CloseSheetScreen({route, navigation}: {route: any; navigation: any}) {
  const {stockUnitId, stockUnitCode, jobId} = route.params as {
    stockUnitId: string;
    stockUnitCode: string;
    jobId?: string;
  };

  const [offcuts, setOffcuts] = useState<Offcut[]>([{lengthMm: '', widthMm: ''}]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (index: number, field: keyof Offcut, value: string) => {
    setOffcuts(current =>
      current.map((row, i) => (i === index ? {...row, [field]: value} : row)),
    );
  };

  const submit = async () => {
    const parsed = offcuts
      .map(row => ({
        lengthMm: Number(row.lengthMm),
        widthMm: Number(row.widthMm),
      }))
      .filter(row => row.lengthMm > 0 && row.widthMm > 0);

    setBusy(true);
    try {
      const result = await api.closeSheet({
        stockUnitId,
        jobId,
        offcuts: parsed,
        remarks: remarks || undefined,
      });
      Alert.alert(
        'Sheet closed',
        `${result.recoveredOffcuts} offcut(s) labelled and returned to stock (${result.recoveredAreaSqm} m²). ` +
          'Anything smaller than the reuse size was booked as waste.',
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    } catch (e) {
      Alert.alert('Could not close sheet', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Close {stockUnitCode}</Text>
      <Text style={styles.subtitle}>
        Measure each usable piece left on the sheet. Small drops can be entered
        too — they are recorded as waste rather than stock.
      </Text>

      {offcuts.map((offcut, index) => (
        <Card key={index}>
          <Text style={styles.cardTitle}>Offcut {index + 1}</Text>
          <View style={styles.dimensionRow}>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="Length mm"
              placeholderTextColor={colors.textMuted}
              value={offcut.lengthMm}
              onChangeText={value => update(index, 'lengthMm', value)}
            />
            <Text style={styles.times}>×</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="Width mm"
              placeholderTextColor={colors.textMuted}
              value={offcut.widthMm}
              onChangeText={value => update(index, 'widthMm', value)}
            />
          </View>
        </Card>
      ))}

      <Button
        title="+ Add another offcut"
        variant="ghost"
        onPress={() => setOffcuts(current => [...current, {lengthMm: '', widthMm: ''}])}
      />

      <TextInput
        style={[styles.input, styles.remarks]}
        placeholder="Remarks (optional)"
        placeholderTextColor={colors.textMuted}
        value={remarks}
        onChangeText={setRemarks}
        multiline
      />

      <Button title="Close sheet" variant="success" loading={busy} onPress={submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm},
  title: {color: colors.text, fontSize: font.h2, fontWeight: '800'},
  subtitle: {color: colors.textMuted, fontSize: font.small, marginBottom: spacing.sm},
  cardTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  dimensionRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  times: {color: colors.textMuted, fontSize: font.h3},
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: font.body,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  remarks: {minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.md},
});
