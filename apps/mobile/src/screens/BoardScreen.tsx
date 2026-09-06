import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Order, OrderBoard } from '@decor/shared';
import { UNIT_LABEL } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { StageBoard } from '../components/StageBoard';
import { Loader, Pill, Screen, ScreenHeader, Text, RoundButton, haptic } from '../ui';
import { palette, spacing } from '../theme';

/** Orders on the board the admin configured. Drag a card sideways to move it. */
export function BoardScreen({ navigation }: { navigation: any }) {
  const board = useApi<OrderBoard>(() => api.orderBoard(), []);
  const [note, setNote] = useState('');

  const move = async (order: Order, toStatusId: string) => {
    try {
      await api.changeOrderStatus(order.id, { toStatusId });
      haptic('notificationSuccess');
      board.refresh();
    } catch (e) {
      haptic('notificationError');
      const message = e instanceof Error ? e.message : 'Could not move';
      // A refusal that needs a note is worth offering to fix rather than
      // just reporting — the person already decided to make the move.
      if (/requires a note/i.test(message)) {
        Alert.prompt?.(
          'A note is required',
          message,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Move',
              onPress: async (text?: string) => {
                if (!text?.trim()) return;
                try {
                  await api.changeOrderStatus(order.id, { toStatusId, note: text.trim() });
                  haptic('notificationSuccess');
                  board.refresh();
                } catch (inner) {
                  Alert.alert(
                    'Still could not move',
                    inner instanceof Error ? inner.message : 'Unknown error',
                  );
                }
              },
            },
          ],
          'plain-text',
        ) ?? Alert.alert('A note is required', message);
      } else {
        Alert.alert('Cannot move there', message);
      }
      board.refresh();
    }
  };

  if (!board.data) return <Loader label="Loading the board" />;

  return (
    <Screen scroll={false} padded={false} tabBarPadding={false}>
      <View style={styles.header}>
        <ScreenHeader
          title="Board"
          subtitle={board.data.workflow.name}
          onBack={() => navigation.goBack()}
          right={<RoundButton icon="settings" onPress={() => navigation.navigate('AdminFlow')} />}
        />
        <Text variant="tiny" tone="faint" style={styles.hint}>
          Drag a card left or right to move it a stage. Moves the flow forbids are refused.
        </Text>
      </View>

      <StageBoard
        columns={board.data.columns.map((column) => ({
          status: column.status,
          items: column.orders,
        }))}
        onMove={move}
        emptyLabel="No orders"
        renderCard={(order) => (
          <View>
            <Text variant="small" bold numberOfLines={1}>{order.client.name}</Text>
            <Text variant="tiny" tone="muted">{order.code}</Text>
            <Text variant="tiny" tone="faint" numberOfLines={1}>{order.location}</Text>
            {order.items[0]?.display ? (
              <Text variant="tiny" style={{ marginTop: 4, color: palette.accent }}>
                {order.items[0].display.length} × {order.items[0].display.width}{' '}
                {UNIT_LABEL[order.items[0].display.unit]}
                {order.items.length > 1 ? `  +${order.items.length - 1}` : ''}
              </Text>
            ) : null}
            {order.priority !== 'NORMAL' ? (
              <View style={{ marginTop: 6 }}>
                <Pill label={order.priority} color={palette.warning} small />
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
});
