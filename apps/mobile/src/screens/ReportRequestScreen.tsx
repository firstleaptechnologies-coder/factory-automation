import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { REPORTS, reportDefinition, reportRequestError } from '@decor/shared';
import { api } from '../api/client';
import { Button, Card, Screen, ScreenHeader, Text } from '../ui';
import { Select } from '../ui/Select';
import { palette, spacing } from '../theme';
import { PERIODS, periodDates } from './report-periods';

/**
 * Asking for a report, from a phone.
 *
 * Periods are offered as the windows a shop actually asks about — this month,
 * last month, the quarter, the financial year — rather than two date fields.
 * Nobody standing on a shop floor wants to type 2026-04-01 twice, and the GST
 * quarter is the whole reason most of these get run.
 *
 * The catalogue and the refusal both come from `@decor/shared`, so this screen
 * cannot offer a report the API will not build, and cannot disagree with it
 * about what a valid request is.
 */
export function ReportRequestScreen({ navigation }: { navigation: any }) {
  const [kind, setKind] = useState<string>(REPORTS[0].kind);
  const [period, setPeriod] = useState<string>('thisMonth');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const definition = reportDefinition(kind);
  const needsPeriod = definition?.period !== 'none';
  const dates = useMemo(() => periodDates(period), [period]);

  const complaint = useMemo(
    () =>
      reportRequestError({
        kind,
        from: needsPeriod ? dates.from : undefined,
        to: needsPeriod ? dates.to : undefined,
        clientId: definition?.subject === 'client' ? undefined : null,
      }),
    [kind, dates, needsPeriod, definition],
  );

  async function submit() {
    setSaving(true);
    setFailed(null);
    try {
      await api.requestReport({ kind, ...(needsPeriod ? dates : {}) });
      navigation.goBack();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That did not work');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader
        title="Ask for a report"
        subtitle="It is built in the background"
        onBack={() => navigation.goBack()}
      />

      <Card>
        <Select
          label="Report"
          value={kind}
          onChange={(next) => setKind(next as string)}
          options={REPORTS.map((report) => ({ value: report.kind, label: report.label }))}
        />
        {!!definition && (
          <Text variant="tiny" tone="muted" style={{ marginTop: spacing.sm }}>
            {definition.description}
          </Text>
        )}
      </Card>

      {needsPeriod && (
        <Card style={{ marginTop: spacing.md }}>
          <Select
            label="Period"
            value={period}
            onChange={(next) => setPeriod(next as string)}
            options={PERIODS.map((one) => ({ value: one.key, label: one.label }))}
          />
          <Text variant="tiny" tone="faint" style={{ marginTop: spacing.sm }}>
            {dates.from} to {dates.to}
          </Text>
        </Card>
      )}

      <View style={styles.foot}>
        {!!complaint && (
          <Text variant="tiny" style={{ color: palette.danger }}>{complaint}</Text>
        )}
        {!!failed && <Text variant="tiny" style={{ color: palette.danger }}>{failed}</Text>}
        <Button
          title="Ask for it"
          onPress={submit}
          loading={saving}
          disabled={Boolean(complaint) || saving}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  foot: { marginTop: spacing.lg, gap: spacing.sm },
});
