import React, {useCallback, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {Order, WorkflowStatus, WorkflowTransition} from '@decor/shared';
import {UNIT_LABEL} from '@decor/shared';
import {api} from '../api/client';
import {Button, Card, Loader, Row, StatusPill} from '../components/ui';
import {colors, font, radius, spacing} from '../theme';

type NextMove = WorkflowTransition & {toStatus: WorkflowStatus};

/** Read an order on site and move it along the admin-defined flow. */
export function OrderDetailScreen({route}: {route: any}) {
  const {orderId} = route.params as {orderId: string};
  const [order, setOrder] = useState<Order | null>(null);
  const [moves, setMoves] = useState<NextMove[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const fresh = await api.order(orderId, 'FT');
    setOrder(fresh);
    setMoves(await api.allowedNext(fresh.status.id));
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const move = async (target: NextMove) => {
    setBusy(true);
    try {
      await api.changeOrderStatus(orderId, {
        toStatusId: target.toStatusId,
        note: note || undefined,
      });
      setNote('');
      await load();
    } catch (e) {
      Alert.alert('Could not move', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!order) return <Loader />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.code}>{order.code}</Text>
        <StatusPill label={order.status.name} color={order.status.color} />
      </View>

      <Card>
        <Row label="Client" value={order.client.name} />
        <Row label="Location" value={order.location} />
        {order.client.phone ? <Row label="Phone" value={order.client.phone} /> : null}
        <Row label="Priority" value={order.priority} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Items</Text>
        {order.items.map(item => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemSize}>
              {item.display
                ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                : '—'}
            </Text>
            <Text style={styles.itemMeta}>
              {item.material.name}
              {item.display?.thickness
                ? ` · ${item.display.thickness} ${UNIT_LABEL[item.display.thicknessUnit]}`
                : ''}
              {` · qty ${item.quantity}`}
            </Text>
            {item.notes ? <Text style={styles.itemMeta}>{item.notes}</Text> : null}
          </View>
        ))}
      </Card>

      {moves.length ? (
        <Card>
          <Text style={styles.cardTitle}>Move to</Text>
          {moves.some(m => m.requiresNote) ? (
            <TextInput
              style={styles.input}
              placeholder="Note (required for some moves)"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
            />
          ) : null}
          {moves.map(m => (
            <Button
              key={m.id}
              title={`${m.label ?? m.toStatus.name}${m.requiresNote ? ' *' : ''}`}
              variant="ghost"
              loading={busy}
              style={styles.moveButton}
              onPress={() => move(m)}
            />
          ))}
        </Card>
      ) : null}

      {order.attachments.length ? (
        <Card>
          <Text style={styles.cardTitle}>Attachments</Text>
          {order.attachments.map(a => (
            <Row
              key={a.id}
              label={a.kind.replace(/_/g, ' ').toLowerCase()}
              value={a.description ?? a.file.fileName}
            />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  code: {color: colors.text, fontSize: font.h2, fontWeight: '800'},
  cardTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  item: {paddingVertical: spacing.xs},
  itemSize: {color: colors.text, fontSize: font.body, fontWeight: '700'},
  itemMeta: {color: colors.textMuted, fontSize: font.small},
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: font.body,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  moveButton: {marginBottom: spacing.sm},
});
