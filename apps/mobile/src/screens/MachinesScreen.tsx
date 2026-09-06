import React, {useCallback, useState} from 'react';
import {RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {MachineBoardEntry} from '@decor/shared';
import {api} from '../api/client';
import {Card, EmptyState, Loader, StatusPill} from '../components/ui';
import {colors, font, spacing} from '../theme';

/** The board a supervisor glances at: what is running, what is waiting. */
export function MachinesScreen({navigation}: {navigation: any}) {
  const [board, setBoard] = useState<MachineBoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoard(await api.machineBoard());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <Loader />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.primary}
        />
      }>
      {board.length === 0 ? <EmptyState message="No machines configured." /> : null}
      {board.map(machine => (
        <Card key={machine.id}>
          <View style={styles.header}>
            <View>
              <Text style={styles.name}>{machine.name}</Text>
              <Text style={styles.code}>{machine.code}</Text>
            </View>
            <StatusPill status={machine.status} />
          </View>

          {machine.currentJob ? (
            <Text
              style={styles.current}
              onPress={() =>
                navigation.navigate('JobDetail', {jobId: machine.currentJob!.id})
              }>
              Running {machine.currentJob.code} · {machine.currentJob.material?.name}
            </Text>
          ) : (
            <Text style={styles.idle}>No job running</Text>
          )}

          <Text style={styles.queue}>
            {machine.queueLength} job{machine.queueLength === 1 ? '' : 's'} queued
          </Text>

          {machine.queue
            .filter(job => job.status === 'QUEUED')
            .slice(0, 3)
            .map(job => (
              <Text
                key={job.id}
                style={styles.queueItem}
                onPress={() => navigation.navigate('JobDetail', {jobId: job.id})}>
                {job.sequence}. {job.code} · {job.material?.name}
              </Text>
            ))}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  name: {color: colors.text, fontSize: font.h3, fontWeight: '700'},
  code: {color: colors.textMuted, fontSize: font.tiny},
  current: {color: colors.success, fontSize: font.small, fontWeight: '600'},
  idle: {color: colors.textMuted, fontSize: font.small},
  queue: {color: colors.textMuted, fontSize: font.tiny, marginTop: spacing.sm},
  queueItem: {color: colors.text, fontSize: font.small, marginTop: 2},
});
