import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Lead, LeadBoard } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { StageBoard } from '../components/StageBoard';
import {
  Button,
  Icon,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

/** The lead pipeline. Same board, same rules, different entity. */
export function LeadsScreen({ navigation }: { navigation: any }) {
  const board = useApi<LeadBoard>(() => api.leadBoard(), []);

  const move = async (lead: Lead, toStatusId: string) => {
    try {
      await api.changeLeadStatus(lead.id, { toStatusId });
      haptic('notificationSuccess');
      board.refresh();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Cannot move there', e instanceof Error ? e.message : 'Unknown error');
      board.refresh();
    }
  };

  if (!board.data) return <Loader label="Loading the pipeline" />;

  const total = board.data.columns.reduce((sum, column) => sum + column.value, 0);

  return (
    <Screen scroll={false} padded={false} tabBarPadding={false}>
      <View style={styles.header}>
        <ScreenHeader
          title="Leads"
          subtitle={`${formatInr(total)} in the pipeline`}
          right={<RoundButton icon="plus" tone="accent" onPress={() => navigation.navigate('LeadCreate')} />}
        />
        <Text variant="tiny" tone="faint" style={styles.hint}>
          Drag a card sideways to move a stage. Tap to open it.
        </Text>
      </View>

      <StageBoard
        columns={board.data.columns.map((column) => ({
          status: column.status,
          items: column.leads,
          subtitle: column.value > 0 ? formatInr(column.value) : undefined,
        }))}
        onMove={move}
        emptyLabel="No leads"
        renderCard={(lead) => (
          <View onTouchEnd={() => navigation.navigate('LeadDetail', { leadId: lead.id })}>
            <Text variant="small" bold numberOfLines={2}>{lead.title}</Text>
            <Text variant="tiny" tone="muted" numberOfLines={1}>
              {lead.contactName ?? lead.client?.name ?? '—'}
              {lead.contactPhone ? ` · ${lead.contactPhone}` : ''}
            </Text>
            {lead.location ? (
              <Text variant="tiny" tone="faint" numberOfLines={1}>{lead.location}</Text>
            ) : null}
            <View style={styles.cardFoot}>
              {lead.estimatedValue ? (
                <Text variant="tiny" tone="accent" bold>
                  {formatInr(Number(lead.estimatedValue))}
                </Text>
              ) : <View />}
              {lead.source ? <Pill label={lead.source.name} color={lead.source.color} small /> : null}
            </View>
            {lead.convertedOrder ? (
              <View style={styles.convertedRow}>
                <Icon name="check" size={12} color={palette.success} />
                <Text variant="micro" tone="success" style={{ marginLeft: 4 }}>
                  {lead.convertedOrder.code}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg },
  hint: { marginBottom: spacing.md },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  convertedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
});
