import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  describeHistory,
  entityLabel,
  fieldLabel,
  historyValue,
  shownChanges,
  type HistoryEntry,
} from '@fas/shared';
import { Text } from '../ui';
import { formatDateTime } from '../lib/format';
import { palette, spacing } from '../theme';

/**
 * One story, in order: moved, edited, paid, moved back.
 *
 * A table was fine while the only thing recorded was a status move. Now that a
 * corrected rate and a receipt taken sit in the same list, a timeline reads
 * better — each entry says what happened in a sentence, with the detail
 * underneath it and the person's name at the bottom.
 */
export function HistoryTimeline({
  entries,
  empty = 'Nothing has happened yet',
}: {
  entries: HistoryEntry[];
  empty?: string;
}) {
  if (entries.length === 0) {
    return (
      <Text variant="small" tone="faint" style={styles.empty}>
        {empty}
      </Text>
    );
  }

  return (
    <View testID="history-timeline">
      {entries.map((entry) => {
        const changes = shownChanges(entry);
        return (
          <View key={entry.id} style={styles.row} testID={`history-${entry.id}`}>
            <View style={[styles.dot, { backgroundColor: colourFor(entry) }]} />
            <View style={styles.body}>
              <Text variant="small" bold>
                {describeHistory(entry)}
              </Text>

              {/* What a diff holds: the field, and both sides of it. */}
              {changes.map((change) => (
                <Text key={change.field} variant="tiny" tone="muted">
                  {fieldLabel(change.field)}: {historyValue(change.from)} →{' '}
                  <Text variant="tiny">{historyValue(change.to)}</Text>
                </Text>
              ))}

              {entry.reason ? (
                <Text variant="tiny" tone="warning" style={styles.reason}>
                  “{entry.reason}”
                </Text>
              ) : null}

              <Text variant="micro" tone="faint">
                {formatDateTime(entry.at)}
                {entry.by ? ` · ${entry.by}` : ''}
                {/* Say which line or which receipt, when it was not the thing itself. */}
                {isPartOfSomething(entry) ? ` · ${entityLabel(entry.entity).toLowerCase()}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** A step back should not look like an ordinary one. */
function colourFor(entry: HistoryEntry): string {
  if (entry.kind === 'moved') return entry.reversed ? palette.warning : palette.accent;
  if (entry.kind === 'created') return palette.success;
  if (entry.kind === 'deleted') return palette.danger;
  return palette.textFaint;
}

const PARTS = new Set(['OrderItem', 'OrderAttachment', 'Payment', 'CashDeposit', 'Disbursement', 'EstimateItem', 'ClientLocation']);

const isPartOfSomething = (entry: HistoryEntry) => PARTS.has(entry.entity);

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  body: { flex: 1, gap: 2 },
  reason: { fontStyle: 'italic' },
});
