import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { Lead, LeadSource, Workflow } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { usePaginated } from '../hooks/usePaginated';
import { FilterSheet } from '../components/FilterSheet';
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  ListFooter,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr, relativeTime } from '../lib/format';

/**
 * Enquiries as a list.
 *
 * The bar opens this rather than the board for the same reason its Orders tab
 * does: looking one up — by name, by phone, by where it came from — is the
 * common errand, and pushing the pipeline along is the occasional one. The
 * board is a tap away on the home card.
 */
export function LeadsScreen({ route, navigation }: { route?: any; navigation: any }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<string | null>(
    (route?.params as { statusId?: string } | undefined)?.statusId ?? null,
  );
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [filterSheet, setFilterSheet] = useState(false);

  const workflow = useApi<Workflow>(() => api.defaultWorkflow('LEAD'), []);
  const sources = useApi<LeadSource[]>(() => api.leadSources(), []);

  const leads = usePaginated<Lead>(
    (page) =>
      api.leads({
        search: search || undefined,
        statusId: statusId ?? undefined,
        sourceId: sourceId ?? undefined,
        page,
        limit: 25,
      }),
    [search, statusId, sourceId],
  );

  const activeFilters = [statusId, sourceId].filter(Boolean).length;

  // Built once per data change: a wheel handed a fresh option list on every
  // render loses track of what was chosen.
  const filterDimensions = useMemo(
    () => [
      {
        key: 'statusId',
        label: 'Stage',
        options: [
          { id: null, label: 'Any stage' },
          ...(workflow.data?.statuses ?? []).map((status) => ({
            id: status.id,
            label: status.name,
            color: status.color,
          })),
        ],
      },
      {
        key: 'sourceId',
        label: 'Source',
        options: [
          { id: null, label: 'Any source' },
          ...(sources.data ?? []).map((source) => ({
            id: source.id,
            label: source.name,
            color: source.color,
          })),
        ],
      },
    ],
    [workflow.data, sources.data],
  );

  return (
    <Screen
      refreshing={leads.refreshing}
      onRefresh={leads.refresh}
      onEndReached={leads.loadMore}
      /* Same as the orders list: what you work the list with stays put. */
      sticky={
        <>
          <ScreenHeader
            title="Leads"
            subtitle={`${leads.total} enquir${leads.total === 1 ? 'y' : 'ies'}`}
            right={<RoundButton icon="filter" testID="filter-button" onPress={() => setFilterSheet(true)} />}
          />

          <Field
            placeholder="Name, phone or what it is for"
            value={search}
            onChangeText={setSearch}
            icon="search"
          />

          {/* The same three the orders list offers, in the same place: the
              board is a way of looking at this list, and a new enquiry starts
              from it. */}
          <View style={styles.actions}>
            <Chip icon="layers" label="Board" onPress={() => navigation.navigate('LeadBoard')} />
            <Chip icon="history" label="Archived" onPress={() => navigation.navigate('ArchivedLeads')} />
            {can(PERMISSIONS.LEAD_CREATE) ? (
              <Chip icon="plus" label="New lead" onPress={() => navigation.navigate('LeadCreate')} />
            ) : null}
            {activeFilters > 0 ? (
              <Chip
                label={`${activeFilters} filter${activeFilters > 1 ? 's' : ''} ×`}
                selected
                onPress={() => {
                  setStatusId(null);
                  setSourceId(null);
                }}
              />
            ) : null}
          </View>
        </>
      }>
      {leads.loading ? (
        <Loader />
      ) : leads.items.length === 0 ? (
        <EmptyState
          icon="trend"
          title="No enquiries match"
          message="Try clearing the search or filters."
        />
      ) : (
        leads.items.map((lead, index) => (
          <Animated.View
            key={lead.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320)}
            layout={Layout.springify()}>
            <Card
              tone="dark"
              style={styles.card}
              onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" numberOfLines={1}>{lead.title}</Text>
                  <Text variant="tiny" tone="muted" numberOfLines={1}>
                    {lead.code} · {relativeTime(lead.createdAt)}
                  </Text>
                </View>
                <Pill label={lead.status.name} color={lead.status.color} small />
              </View>

              <View style={styles.metaRow}>
                <Icon name="user" size={13} color={palette.textFaint} />
                <Text variant="tiny" tone="faint" numberOfLines={1} style={styles.meta}>
                  {lead.contactName ?? lead.client?.name ?? '—'}
                  {lead.contactPhone ? ` · ${lead.contactPhone}` : ''}
                </Text>
              </View>

              {lead.location ? (
                <View style={styles.metaRow}>
                  <Icon name="pin" size={13} color={palette.textFaint} />
                  <Text variant="tiny" tone="faint" numberOfLines={1} style={styles.meta}>
                    {lead.location}
                  </Text>
                </View>
              ) : null}

              <View style={styles.footRow}>
                {lead.source ? (
                  <Pill label={lead.source.name} color={lead.source.color ?? palette.surfaceLit} small />
                ) : null}
                <View style={{ flex: 1 }} />
                {lead.convertedOrder ? (
                  <Text variant="tiny" tone="success" bold>
                    → {lead.convertedOrder.code}
                  </Text>
                ) : lead.estimatedValue ? (
                  <Text variant="small" tone="accent" bold>
                    {formatInr(Number(lead.estimatedValue))}
                  </Text>
                ) : null}
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <ListFooter
        loading={leads.loadingMore}
        hasMore={leads.hasMore}
        shown={leads.items.length}
        total={leads.total}
        noun="enquiries"
      />

      <FilterSheet
        visible={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Filter leads"
        dimensions={filterDimensions}
        value={{ statusId, sourceId }}
        onApply={(next) => {
          setStatusId(next.statusId ?? null);
          setSourceId(next.sourceId ?? null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  meta: { marginLeft: 4, flex: 1 },
  footRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
});
