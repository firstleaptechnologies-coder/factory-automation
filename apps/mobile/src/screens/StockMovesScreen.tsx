import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { StockLevels, StockMove, StockMoveKind } from '@decor/shared';
import {
  PERMISSIONS,
  RECORDABLE_MOVES,
  STOCK_MOVE_LABELS,
  today,
} from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Loader,
  RoundButton,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort } from '../lib/format';

/** The colour each kind of move reads as. */
const TONE: Record<StockMoveKind, string> = {
  RECEIPT: palette.success,
  OFFCUT: palette.info,
  CONSUMPTION: palette.textMuted,
  WASTE: palette.danger,
  ADJUSTMENT: palette.warning,
  RETURN: palette.textFaint,
};

/** Which kinds a person has to explain. */
const NEEDS_A_REASON: StockMoveKind[] = ['WASTE', 'ADJUSTMENT'];

/**
 * Everything that ever happened to one material.
 *
 * A delivery cannot be recorded here — stock arrives against a purchase, so
 * that everything on the rack has a bill behind it. What can be recorded is
 * what became of it afterwards.
 */
export function StockMovesScreen({ navigation, route }: { navigation: any; route: any }) {
  const materialId: string = route.params.materialId;
  const { can } = useAuth();

  const moves = useApi<StockMove[]>(() => api.stockMoves(materialId), [materialId]);
  const level = useApi<StockLevels>(() => api.stockLevels({ materialId }), [materialId]);

  const [sheet, setSheet] = useState(false);
  const [kind, setKind] = useState<StockMoveKind>('CONSUMPTION');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [at, setAt] = useState(today());
  const [busy, setBusy] = useState(false);

  const canMove = can(PERMISSIONS.STOCK_MOVE);
  const row = level.data?.rows[0];
  const needsReason = NEEDS_A_REASON.includes(kind);

  const record = async () => {
    setBusy(true);
    try {
      await api.recordStockMove({
        materialId,
        kind,
        quantity: Number(quantity),
        reason: reason.trim() || undefined,
        at,
      });
      haptic('notificationSuccess');
      setSheet(false);
      setQuantity('');
      setReason('');
      moves.reload();
      level.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not record it', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (moves.loading && !moves.data) return <Loader label="Loading" />;

  return (
    <Screen refreshing={moves.refreshing} onRefresh={moves.refresh}>
      <ScreenHeader
        title={row?.material.name ?? 'Material'}
        subtitle={
          row ? `${row.quantity} ${row.material.stockUnit} on the rack` : 'The story of the rack'
        }
        onBack={() => navigation.goBack()}
        right={
          canMove ? (
            <RoundButton icon="plus" testID="record-move" onPress={() => setSheet(true)} />
          ) : null
        }
      />

      {(moves.data ?? []).length === 0 ? (
        <EmptyState icon="history" title="Nothing has moved yet" />
      ) : (
        (moves.data ?? []).map((move) => (
          <Card key={move.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={[styles.dot, { backgroundColor: TONE[move.kind] }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3">{STOCK_MOVE_LABELS[move.kind]}</Text>
                <Text variant="tiny" tone="muted">
                  {formatDateShort(move.at)}
                  {move.order ? ` · ${move.order.code}` : ''}
                  {move.recordedBy ? ` · ${move.recordedBy.name}` : ''}
                </Text>
                {move.reason ? (
                  <Text variant="tiny" tone="faint">“{move.reason}”</Text>
                ) : null}
              </View>
              <Text variant="h3">
                {Number(move.quantity) > 0 ? '+' : ''}
                {move.quantity} {move.unit}
              </Text>
            </View>
          </Card>
        ))
      )}

      <Sheet
        visible={sheet}
        title="Record a move"
        subtitle="A delivery arrives against a purchase, not here"
        onClose={() => setSheet(false)}>
        <Select
          label="What happened"
          value={kind}
          options={RECORDABLE_MOVES.map((one) => ({
            value: one,
            label: STOCK_MOVE_LABELS[one],
          }))}
          onChange={(value) => setKind(value as StockMoveKind)}
        />
        <Field
          label="How many"
          placeholder="0"
          keyboardType="numeric"
          value={quantity}
          onChangeText={setQuantity}
        />
        <Field
          label={needsReason ? 'Why (required)' : 'Why'}
          placeholder="Board split on the saw"
          value={reason}
          onChangeText={setReason}
        />
        <Field label="When" placeholder="YYYY-MM-DD" value={at} onChangeText={setAt} />
        <Button
          title="Record it"
          loading={busy}
          disabled={!Number(quantity) || (needsReason && reason.trim().length < 3)}
          onPress={record}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
