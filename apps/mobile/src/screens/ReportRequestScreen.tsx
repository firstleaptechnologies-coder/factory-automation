import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Client } from '@fas/shared';
import { REPORTS, reportDefinition, reportRequestError } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Button,
  Card,
  Field,
  Screen,
  ScreenHeader,
  Sheet,
  SheetOption,
  SelectField,
  Text,
} from '../ui';
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
 * The catalogue and the refusal both come from `@fas/shared`, so this screen
 * cannot offer a report the API will not build, and cannot disagree with it
 * about what a valid request is.
 */
export function ReportRequestScreen({ navigation }: { navigation: any }) {
  const [kind, setKind] = useState<string>(REPORTS[0].kind);
  const [period, setPeriod] = useState<string>('thisMonth');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | undefined>();
  const [clientName, setClientName] = useState('');
  const [clientSheet, setClientSheet] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const definition = reportDefinition(kind);
  const needsPeriod = definition?.period !== 'none';
  const needsClient = definition?.subject === 'client';
  const dates = useMemo(() => periodDates(period), [period]);

  // Only fetched when a report actually asks for one, so choosing the cash
  // book does not go looking up the client list on a phone connection.
  const clients = useApi<{ data: Client[] }>(
    () =>
      needsClient
        ? api.clients({ search: clientSearch || undefined, limit: 20 })
        : Promise.resolve({ data: [] as Client[] }),
    [needsClient, clientSearch],
  );

  const complaint = useMemo(
    () =>
      reportRequestError({
        kind,
        from: needsPeriod ? dates.from : undefined,
        to: needsPeriod ? dates.to : undefined,
        clientId: needsClient ? clientId ?? null : null,
      }),
    [kind, dates, needsPeriod, needsClient, clientId],
  );

  async function submit() {
    setSaving(true);
    setFailed(null);
    try {
      await api.requestReport({
        kind,
        ...(needsPeriod ? dates : {}),
        ...(needsClient && clientId ? { clientId } : {}),
      });
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

      {needsClient && (
        <Card style={{ marginTop: spacing.md }}>
          <SelectField
            label="Client"
            placeholder="Choose a client"
            value={clientName || null}
            icon="user"
            onPress={() => setClientSheet(true)}
          />
        </Card>
      )}

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

      <Sheet
        visible={clientSheet}
        title="Pick a client"
        onClose={() => setClientSheet(false)}
        fullHeight>
        <Field
          placeholder="Name or phone"
          value={clientSearch}
          onChangeText={setClientSearch}
          icon="search"
          pasteable={false}
        />
        {(clients.data?.data ?? []).map((client) => (
          <SheetOption
            key={client.id}
            label={client.name}
            description={[client.code, client.phone].filter(Boolean).join(' · ')}
            selected={clientId === client.id}
            onPress={() => {
              setClientId(client.id);
              setClientName(client.name);
              setClientSheet(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  foot: { marginTop: spacing.lg, gap: spacing.sm },
});
