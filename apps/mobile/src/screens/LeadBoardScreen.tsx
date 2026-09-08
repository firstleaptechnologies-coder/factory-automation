import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Lead, LeadBoard } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { StageBoard } from '../components/StageBoard';
import {
  Icon,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
  ask,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

/**
 * The lead pipeline as a board. Same board, same rules, different entity.
 *
 * Reached from the home card rather than the bar: the bar's Leads tab is the
 * list, for the same reason its Orders tab is — you look something up far more
 * often than you push the whole pipeline along.
 */
export function LeadBoardScreen({ navigation }: { navigation: any }) {
  const board = useApi<LeadBoard>(() => api.leadBoard(), []);

  const move = async (lead: Lead, toStatusId: string) => {
    try {
      await api.changeLeadStatus(lead.id, { toStatusId });
      haptic('notificationSuccess');
      board.refresh();
    } catch (e) {
      haptic('notificationError');
      const message = e instanceof Error ? e.message : 'Unknown error';
      // The server says "move back" only where the arrow exists the other way
      // round and this person may take it; anyone else gets a plain refusal.
      if (/move back/i.test(message)) askToGoBack(lead, toStatusId, message);
      else Alert.alert('Cannot move there', message);
      board.refresh();
    }
  };

  /** The question, then the move again with the acknowledgement on it. */
  const askToGoBack = (lead: Lead, toStatusId: string, message: string) => {
    const send = async (note?: string) => {
      try {
        await api.changeLeadStatus(lead.id, {
          toStatusId,
          note: note?.trim() || undefined,
          reverse: true,
        });
        haptic('notificationSuccess');
      } catch (inner) {
        Alert.alert(
          'Could not move it back',
          inner instanceof Error ? inner.message : 'Unknown error',
        );
      }
      board.refresh();
    };

    ask(`Send ${lead.code} back?`, `${message} Why is it going back?`, [
      { text: 'Leave it', style: 'cancel' },
      { text: 'Move it back', onPress: send },
    ]);
  };

  if (!board.data) return <Loader label="Loading the pipeline" />;

  const total = board.data.columns.reduce((sum, column) => sum + column.value, 0);

  return (
    <Screen scroll={false} padded={false} tabBarPadding={false}>
      <View style={styles.header}>
        <ScreenHeader
          title="Leads"
          subtitle={`${formatInr(total)} in the pipeline`}
          // Reached from the home card now rather than being a tab, so there
          // has to be a way back off it.
          onBack={() => navigation.goBack()}
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
          total: column.total,
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
