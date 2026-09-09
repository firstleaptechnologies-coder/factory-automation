import React, { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import type { Report } from '@decor/shared';
import { PERMISSIONS, REPORT_LABELS, REPORT_STATUS_LABELS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, EmptyState, Loader, Pill, Screen, ScreenHeader, Text } from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort } from '../lib/format';

/** Still going to change on its own, without anybody doing anything. */
const isWorking = (status: Report['status']) =>
  status === 'QUEUED' || status === 'GENERATING';

const colourFor = (status: Report['status']) => {
  if (status === 'READY') return palette.success;
  if (status === 'FAILED') return palette.danger;
  if (status === 'EXPIRED') return palette.muted;
  return palette.warning;
};

/**
 * Everything the shop has asked for, newest first.
 *
 * A report is asked for on one request and built on another, so this list
 * shows work in progress: rows move from Waiting to Building to Ready by
 * themselves. It looks again every few seconds while something is working and
 * stops the moment nothing is — a screen that polls forever is a screen that
 * keeps a phone awake in somebody's pocket all afternoon.
 */
export function ReportsScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const reports = useApi<Report[]>(() => api.reports(), []);

  const rows = reports.data ?? [];
  const working = rows.some((row) => isWorking(row.status));

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(reports.refresh, 4000);
    return () => clearInterval(timer);
  }, [working, reports.refresh]);

  if (reports.loading && rows.length === 0) return <Loader label="Loading reports" />;

  return (
    <Screen refreshing={reports.refreshing} onRefresh={reports.refresh}>
      <ScreenHeader
        title="Reports"
        subtitle="Exports for the books"
        onBack={() => navigation.goBack()}
      />

      {can(PERMISSIONS.REPORT_RUN) && (
        <Button
          title="Ask for a report"
          onPress={() => navigation.navigate('ReportRequest')}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="Nothing asked for yet"
          message="A report is built in the background and kept for a fortnight."
        />
      ) : (
        rows.map((row) => (
          <Card key={row.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>
                  {REPORT_LABELS[row.kind as never] ?? row.kind}
                </Text>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {row.fromDate && row.toDate
                    ? `${formatDateShort(row.fromDate)} — ${formatDateShort(row.toDate)}`
                    : 'All time'}
                  {row.rowCount != null ? ` · ${row.rowCount} rows` : ''}
                </Text>
                <Text variant="tiny" tone="faint">
                  {formatDateShort(row.createdAt)}
                  {row.requestedBy?.name ? ` · ${row.requestedBy.name}` : ''}
                </Text>
                {/* Said plainly, rather than leaving somebody looking at a row
                    that stopped moving with no reason given. */}
                {row.status === 'FAILED' && !!row.error && (
                  <Text variant="tiny" style={{ color: palette.danger }}>
                    {row.error}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Pill
                  label={REPORT_STATUS_LABELS[row.status]}
                  color={colourFor(row.status)}
                  small
                />
                {row.status === 'READY' && (
                  <Button
                    title="Download"
                    variant="ghost"
                    size="sm"
                    onPress={() => Linking.openURL(api.reportDownloadUrl(row.id))}
                  />
                )}
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
