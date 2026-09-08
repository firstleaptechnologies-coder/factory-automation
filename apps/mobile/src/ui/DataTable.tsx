import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { spacing } from '../theme';
import { Text } from './Text';

export interface Column<T> {
  key: string;
  header: string;
  /** Share of the row's width. Defaults to 1. */
  flex?: number;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
}

/**
 * Rows of facts, as columns.
 *
 * Items, history and status lists are all fundamentally tables — a fixed set of
 * fields repeated down the screen. Laid out as free text they read as a
 * paragraph and the eye cannot scan one field down the column, which is exactly
 * what somebody checking a list of sizes or a sequence of moves is trying to do.
 *
 * A phone is narrow, so the whole table scrolls sideways when the columns need
 * more room than there is, rather than squeezing the text to nothing.
 */
export function DataTable<T extends { id?: string }>({
  columns,
  rows,
  minWidth,
  detail,
  empty = 'Nothing here',
  style,
}: {
  columns: Column<T>[];
  rows: T[];
  /** The table's width when the columns need more room than a phone has. */
  minWidth?: number;
  /*
   * Whatever will not fit a column, drawn under the row across the full width.
   *
   * A column of wrapping chips is the case this exists for: as a column it
   * either sets the width of the whole table — pushing itself off the side of
   * a phone — or squeezes every other column to nothing. Under the row it
   * reads as belonging to that row and costs no width at all.
   */
  detail?: (row: T) => React.ReactNode;
  empty?: string;
  style?: ViewStyle;
}) {
  /*
   * A definite width, not a minimum.
   *
   * Inside a horizontal ScrollView a child is given unbounded width, so
   * `minWidth` left the row free to grow to fit its content — the flex shares
   * on the cells then meant nothing and anything unshrinkable, a row of chips
   * for instance, pushed the later columns off the end instead of wrapping.
   * Fixing the width makes the shares real and lets cell content wrap.
   */
  const table = (
    <View style={[minWidth ? { width: minWidth } : undefined, style]}>
      <View style={styles.head}>
        {columns.map((column) => (
          <Text
            key={column.key}
            variant="tiny"
            tone="faint"
            bold
            style={[
              styles.cell,
              { flex: column.flex ?? 1 },
              column.align === 'right' && styles.right,
              styles.header,
            ]}
            numberOfLines={1}>
            {column.header}
          </Text>
        ))}
      </View>

      {rows.length === 0 ? (
        <Text variant="small" tone="faint" style={styles.empty}>
          {empty}
        </Text>
      ) : (
        rows.map((row, index) => (
          <View key={row.id ?? index} style={[styles.group, index > 0 && styles.divided]}>
            <View style={styles.row}>
              {columns.map((column) => (
                <View
                  key={column.key}
                  style={[
                    styles.cell,
                    { flex: column.flex ?? 1 },
                    column.align === 'right' && styles.rightCell,
                  ]}>
                  {column.render(row)}
                </View>
              ))}
            </View>
            {detail ? <View style={styles.detail}>{detail(row)}</View> : null}
          </View>
        ))
      )}
    </View>
  );

  if (!minWidth) return table;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {table}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
  },
  header: {
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  group: {
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detail: {
    paddingTop: spacing.sm,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.3)',
  },
  cell: { paddingRight: spacing.md, minWidth: 0 },
  right: { textAlign: 'right' },
  rightCell: { alignItems: 'flex-end', paddingRight: 0 },
  empty: { paddingVertical: spacing.lg, textAlign: 'center' },
});
