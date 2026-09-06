import React, {useCallback, useEffect, useState} from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {StockSummaryRow, StockUnit} from '@decor/shared';
import {formatArea, formatSheetSize} from '@decor/shared';
import {api} from '../api/client';
import {Button, Card, EmptyState, Loader} from '../components/ui';
import {colors, font, radius, spacing} from '../theme';

type Tab = 'summary' | 'offcuts' | 'search';

export function StockScreen({navigation}: {navigation: any}) {
  const [tab, setTab] = useState<Tab>('summary');
  const [summary, setSummary] = useState<StockSummaryRow[]>([]);
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === 'summary') {
        setSummary(await api.stockSummary());
      } else {
        const result = await api.stock({
          offcutsOnly: tab === 'offcuts' ? true : undefined,
          search: tab === 'search' && search ? search : undefined,
          limit: 50,
        });
        setUnits(result.data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, search]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {(['summary', 'offcuts', 'search'] as Tab[]).map(value => (
          <Button
            key={value}
            title={value === 'summary' ? 'On hand' : value === 'offcuts' ? 'Offcuts' : 'Find'}
            variant={tab === value ? 'primary' : 'ghost'}
            style={styles.tabButton}
            onPress={() => setTab(value)}
          />
        ))}
      </View>

      {tab === 'search' ? (
        <TextInput
          style={styles.input}
          placeholder="Scan or type a sheet code (SU-…)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => void load()}
        />
      ) : null}

      {loading ? (
        <Loader />
      ) : (
        <ScrollView
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
          {tab === 'summary' ? (
            summary.length === 0 ? (
              <EmptyState message="No stock on hand." />
            ) : (
              summary.map(row => (
                <Card key={`${row.materialId}-${row.kind}`}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.name}>{row.materialName}</Text>
                    <Text style={styles.kind}>{row.kind.replace(/_/g, ' ')}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {row.pieces} piece{row.pieces === 1 ? '' : 's'} ·{' '}
                    {row.areaSqm ? formatArea(row.areaSqm) : `${row.quantity}`}
                  </Text>
                  {row.belowReorderLevel ? (
                    <Text style={styles.warning}>Below reorder level</Text>
                  ) : null}
                </Card>
              ))
            )
          ) : units.length === 0 ? (
            <EmptyState
              message={tab === 'offcuts' ? 'No offcuts in store.' : 'No matching sheets.'}
            />
          ) : (
            units.map(unit => (
              <Card
                key={unit.id}
                onPress={() =>
                  navigation.navigate('CloseSheet', {
                    stockUnitId: unit.id,
                    stockUnitCode: unit.code,
                  })
                }>
                <View style={styles.rowBetween}>
                  <Text style={styles.name}>{unit.code}</Text>
                  <Text style={styles.kind}>{unit.kind.replace(/_/g, ' ')}</Text>
                </View>
                <Text style={styles.meta}>{unit.material?.name}</Text>
                <Text style={styles.meta}>
                  {formatSheetSize(unit.lengthMm, unit.widthMm)}
                  {unit.areaSqm ? ` · ${formatArea(unit.areaSqm)}` : ''}
                </Text>
                <Text style={styles.meta}>{unit.location?.name ?? 'No location'}</Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  tabs: {flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: 0},
  tabButton: {flex: 1, minHeight: 44},
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: font.body,
    margin: spacing.md,
    marginBottom: 0,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  name: {color: colors.text, fontSize: font.body, fontWeight: '700'},
  kind: {color: colors.textMuted, fontSize: font.tiny},
  meta: {color: colors.textMuted, fontSize: font.small, marginTop: 2},
  warning: {color: colors.warning, fontSize: font.small, marginTop: spacing.xs, fontWeight: '600'},
});
