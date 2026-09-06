import React, {useCallback, useState} from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {Dashboard, Job} from '@decor/shared';
import {formatArea, formatCurrency} from '@decor/shared';
import {api} from '../api/client';
import {useAuth} from '../auth/AuthContext';
import {Button, Card, EmptyState, Loader, Stat, StatusPill} from '../components/ui';
import {colors, font, spacing} from '../theme';

export function HomeScreen({navigation}: {navigation: any}) {
  const {user, signOut} = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [queue, setQueue] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [summary, myJobs] = await Promise.all([api.dashboard(), api.myQueue()]);
      setDashboard(summary);
      setQueue(myJobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server');
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
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{user?.name}</Text>
          <Text style={styles.role}>{user?.role}</Text>
        </View>
        <Button title="Sign out" variant="ghost" onPress={signOut} style={styles.signOut} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {dashboard ? (
        <>
          <Card>
            <Text style={styles.cardTitle}>Today</Text>
            <View style={styles.statRow}>
              <Stat label="Open orders" value={dashboard.orders.open} />
              <Stat
                label="Overdue"
                value={dashboard.orders.overdue}
                tone={dashboard.orders.overdue > 0 ? 'danger' : 'default'}
              />
              <Stat label="Jobs done" value={dashboard.jobsCompletedToday} tone="success" />
              <Stat label="Running" value={dashboard.jobs.RUNNING ?? 0} />
            </View>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Material this month</Text>
            <View style={styles.statRow}>
              <Stat label="Waste" value={formatArea(dashboard.wasteThisMonth.areaSqm)} tone="warning" />
              <Stat label="Waste cost" value={formatCurrency(dashboard.wasteThisMonth.cost)} tone="warning" />
              <Stat label="Offcuts held" value={dashboard.offcutStock.pieces} tone="success" />
              <Stat label="Offcut value" value={formatCurrency(dashboard.offcutStock.value)} tone="success" />
            </View>
          </Card>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>My queue</Text>
      {queue.length === 0 ? (
        <EmptyState message="Nothing queued for you right now." />
      ) : (
        queue.map(job => (
          <Card key={job.id} onPress={() => navigation.navigate('JobDetail', {jobId: job.id})}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobCode}>{job.code}</Text>
              <StatusPill status={job.status} />
            </View>
            <Text style={styles.jobMeta}>
              {job.machine?.name ?? 'Unassigned'} · {job.material?.name}
            </Text>
            <Text style={styles.jobMeta}>
              {job.order ? `${job.order.code} · ${job.order.customer?.name ?? ''}` : 'Internal job'}
            </Text>
            <Text style={styles.jobQty}>Qty {job.quantity}</Text>
          </Card>
        ))
      )}
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
  greeting: {color: colors.text, fontSize: font.h2, fontWeight: '800'},
  role: {color: colors.textMuted, fontSize: font.small},
  signOut: {minHeight: 40, paddingHorizontal: spacing.md},
  cardTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  statRow: {flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md},
  sectionTitle: {
    color: colors.text,
    fontSize: font.h3,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  jobHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  jobCode: {color: colors.text, fontSize: font.body, fontWeight: '700'},
  jobMeta: {color: colors.textMuted, fontSize: font.small, marginTop: 2},
  jobQty: {color: colors.text, fontSize: font.small, marginTop: spacing.xs, fontWeight: '600'},
  error: {color: colors.danger, fontSize: font.small, marginBottom: spacing.sm},
});
