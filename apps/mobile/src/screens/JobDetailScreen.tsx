import React, {useCallback, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {Job} from '@decor/shared';
import {formatDate, formatDuration} from '@decor/shared';
import {api} from '../api/client';
import {Button, Card, Loader, Row, StatusPill} from '../components/ui';
import {colors, font, radius, spacing} from '../theme';

/**
 * The operator's working screen. Start / pause / complete are the three buttons
 * that matter; everything else is reference information kept below them.
 */
export function JobDetailScreen({route, navigation}: {route: any; navigation: any}) {
  const {jobId} = route.params as {jobId: string};
  const [job, setJob] = useState<(Job & {operations?: any[]; materialIssues?: any[]}) | null>(null);
  const [busy, setBusy] = useState(false);
  const [completedQty, setCompletedQty] = useState('');

  const load = useCallback(async () => {
    const fresh = (await api.job(jobId)) as any;
    setJob(fresh);
    setCompletedQty(String(Number(fresh.completedQty ?? 0) || ''));
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert(failure, e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!job) return <Loader />;

  const isRunning = job.status === 'RUNNING';
  const isFinished = job.status === 'COMPLETED' || job.status === 'CANCELLED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.code}>{job.code}</Text>
        <StatusPill status={job.status} />
      </View>

      <Card>
        <Row label="Machine" value={job.machine?.name ?? 'Unassigned'} />
        <Row label="Material" value={job.material?.name ?? '—'} />
        <Row label="Order" value={job.order?.code ?? 'Internal'} />
        <Row label="Customer" value={job.order?.customer?.name ?? '—'} />
        <Row label="Due" value={formatDate(job.order?.dueDate)} />
        <Row label="Quantity" value={String(job.quantity)} />
        <Row
          label="Estimated"
          value={job.estimatedMinutes ? formatDuration(job.estimatedMinutes) : '—'}
        />
        {job.actualMinutes ? (
          <Row label="Actual" value={formatDuration(job.actualMinutes)} />
        ) : null}
        {job.nestPlan ? (
          <Row label="Nest" value={`${job.nestPlan.code} · ${job.nestPlan.utilizationPct}%`} />
        ) : null}
      </Card>

      {!isFinished ? (
        <View style={styles.actions}>
          {isRunning ? (
            <>
              <Button
                title="Pause"
                variant="warning"
                loading={busy}
                onPress={() => act(() => api.pauseJob(job.id), 'Could not pause')}
              />
              <Button
                title="Complete job"
                variant="success"
                loading={busy}
                onPress={() =>
                  Alert.alert('Complete job', `Mark ${job.code} as complete?`, [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'Complete',
                      onPress: () => act(() => api.completeJob(job.id), 'Could not complete'),
                    },
                  ])
                }
              />
            </>
          ) : (
            <Button
              title="Start job"
              variant="success"
              loading={busy}
              onPress={() => act(() => api.startJob(job.id), 'Could not start')}
            />
          )}
        </View>
      ) : null}

      {!isFinished ? (
        <Card>
          <Text style={styles.cardTitle}>Progress</Text>
          <View style={styles.progressRow}>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="Pieces done"
              placeholderTextColor={colors.textMuted}
              value={completedQty}
              onChangeText={setCompletedQty}
            />
            <Button
              title="Save"
              style={styles.saveButton}
              loading={busy}
              onPress={() =>
                act(
                  () =>
                    api.updateJobProgress(job.id, {
                      completedQty: Number(completedQty || 0),
                    }),
                  'Could not save progress',
                )
              }
            />
          </View>
          <Text style={styles.hint}>
            Rejected so far: {job.rejectedQty} of {job.quantity}
          </Text>
        </Card>
      ) : null}

      {job.materialIssues?.length ? (
        <Card>
          <Text style={styles.cardTitle}>Sheets issued</Text>
          {job.materialIssues.map((issue: any) => (
            <Row
              key={issue.id}
              label={issue.stockUnit.code}
              value={
                <Button
                  title="Close sheet"
                  variant="ghost"
                  style={styles.inlineButton}
                  onPress={() =>
                    navigation.navigate('CloseSheet', {
                      stockUnitId: issue.stockUnit.id,
                      stockUnitCode: issue.stockUnit.code,
                      jobId: job.id,
                    })
                  }
                />
              }
            />
          ))}
        </Card>
      ) : null}

      {job.operations?.length ? (
        <Card>
          <Text style={styles.cardTitle}>Routing</Text>
          {job.operations.map((op: any) => (
            <Row key={op.id} label={`${op.seq}. ${op.type}`} value={op.status} />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  code: {color: colors.text, fontSize: font.h2, fontWeight: '800'},
  actions: {gap: spacing.sm, marginBottom: spacing.md},
  cardTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  progressRow: {flexDirection: 'row', gap: spacing.sm},
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
  saveButton: {minWidth: 100},
  inlineButton: {minHeight: 36, paddingHorizontal: spacing.sm},
  hint: {color: colors.textMuted, fontSize: font.small, marginTop: spacing.sm},
});
